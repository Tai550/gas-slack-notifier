/**
 * SlackMentionAggregator.ts
 *
 * 昨日自分宛に届いたメンションを検索し、
 * チャンネルのリストをSlack（Webhook）で通知するモジュール。
 */

// ============================================================
// 定数・設定
// ============================================================

/** スクリプトプロパティのキー名 */
const SLACK_USER_TOKEN_KEY = 'SLACK_USER_TOKEN';
const SLACK_USER_ID_KEY = 'SLACK_USER_ID';

// ============================================================
// メイン集計関数
// ============================================================

/**
 * 昨日メンションが届いたチャンネルをリスト化して送信する。
 * 毎朝のトリガー実行を想定。
 */
function reportYesterdayMentions(): void {
    const props = PropertiesService.getScriptProperties();
    const userToken = props.getProperty(SLACK_USER_TOKEN_KEY);
    const userId = props.getProperty(SLACK_USER_ID_KEY);
    const webhookUrl = props.getProperty('SLACK_WEBHOOK_URL_test');

    // バリデーション
    if (!userToken || !userId || !webhookUrl) {
        Logger.log('エラー: 設定（Token, UserID, Webhook）が不足しています。');
        return;
    }

    // --- 期間の設定（昨日 0:00 〜 23:59） ---
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const dateString = Utilities.formatDate(yesterday, 'Asia/Tokyo', 'yyyy-MM-dd');
    const todayString = Utilities.formatDate(today, 'Asia/Tokyo', 'yyyy-MM-dd');

    // --- 検索クエリの作成 ---
    // hit率を最大化するため、"to:me"（自分宛）、"<@UserID>"（メンション文字列）、および名前の直接入力をOR検索します
    const query = `(to:me OR <@${userId}> OR "Taichi Yoda" OR "依田太一") after:${dateString} before:${todayString}`;
    Logger.log(`[DEBUG] Search Query Initiated: ${query}`);

    // --- Slack検索APIの実行（ページネーション対応） ---
    const messages = searchSlackMessages(userToken, query);

    if (messages.length === 0) {
        Logger.log('[DEBUG] No messages found for the query.');
        postToSlack(webhookUrl, `昨日（${dateString}）のメンションは検索で見つかりませんでした。詳細な設定やログを確認してください。☕`);
        return;
    }

    // --- チャンネルの集計 ---
    const channelList = aggregateMentions(messages);

    // --- メッセージの作成 ---
    const reportMessage = [
        `📅 *昨日（${dateString}）のメンション集計*`,
        `以下のチャンネルでメンションが届いていました（合計 ${messages.length} 件）：\n`,
        ...channelList.map((ch) => `• #${ch.name} (<https://slack.com/archives/${ch.id}|開く>)`),
        `\n確認漏れがないかチェックしましょう！🚀`,
    ].join('\n');

    // --- 送信 ---
    postToSlack(webhookUrl, reportMessage);
}

// ============================================================
// 検索・集計ロジック
// ============================================================

/**
 * Slack Search API を使用してメッセージを検索する（全ページ取得）。
 */
function searchSlackMessages(token: string, query: string): any[] {
    let allMessages: any[] = [];
    let page = 1;
    let pageCount = 1;

    Logger.log(`[DEBUG] Starting Slack Search with query: ${query}`);

    do {
        const url = `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=100&page=${page}`;
        const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
            method: 'get',
            headers: { Authorization: `Bearer ${token}` },
            muteHttpExceptions: true,
        };

        const response = UrlFetchApp.fetch(url, options);
        const resString = response.getContentText();
        const resJson = JSON.parse(resString);

        if (!resJson.ok) {
            Logger.log(`[ERROR] Slack API Error: ${resJson.error}`);
            if (resJson.error === 'invalid_auth') {
                Logger.log('[ERROR] Token may be invalid or expired.');
            }
            break;
        }

        // 検索全体のメタ情報を出力
        if (page === 1) {
            const totalCount = resJson.messages.pagination.total_count;
            Logger.log(`[DEBUG] Total hits on Slack: ${totalCount}`);
        }

        const matches = resJson.messages.matches || [];
        Logger.log(`[DEBUG] Page ${page}: Found ${matches.length} matches.`);

        // デバッグ用：取得メッセージの断片をログ出力
        if (matches.length > 0) {
            const sample = matches[0];
            Logger.log(`[DEBUG] Sample Match - Channel: ${sample.channel.name} (${sample.channel.id}), Text fragment: ${sample.text.substring(0, 30)}...`);
        }

        allMessages = allMessages.concat(matches);

        pageCount = resJson.messages.pagination.page_count;
        page++;

        // API制限を考慮し、極端に多い場合は5ページ（500件）で切り上げる
        if (page > 5) {
            Logger.log('[WARN] Reached maximum page limit (5). Cutting off.');
            break;
        }

    } while (page <= pageCount);

    Logger.log(`[DEBUG] Completed search. Total messages collected: ${allMessages.length}`);
    return allMessages;
}

/**
 * 検索結果からユニークなチャンネルリストを作成する。
 */
function aggregateMentions(messages: any[]): { id: string; name: string }[] {
    const channelMap = new Map<string, string>();

    messages.forEach((msg) => {
        if (msg.channel && msg.channel.id) {
            // チャンネル名が伏せられている場合（プライベート等）のフォールバック
            const channelName = msg.channel.name || `private-channel-${msg.channel.id}`;
            channelMap.set(msg.channel.id, channelName);
        }
    });

    const list: { id: string; name: string }[] = [];
    channelMap.forEach((name, id) => {
        list.push({ id, name });
    });

    // チャンネル名でソート
    return list.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================
// トリガー設定
// ============================================================

/**
 * 毎朝 8:00 - 9:00 に実行されるトリガーを設定する。
 */
function setDailyMentionTrigger(): void {
    // 既存トリガーの削除
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach((t) => {
        if (t.getHandlerFunction() === 'reportYesterdayMentions') {
            ScriptApp.deleteTrigger(t);
        }
    });

    // 新規登録
    ScriptApp.newTrigger('reportYesterdayMentions')
        .timeBased()
        .atHour(8)
        .everyDays(1)
        .create();

    Logger.log('✅ 毎日朝8-9時の集計トリガーを登録しました。');
}
