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

    // --- 期間の設定（昨日） ---
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateString = Utilities.formatDate(yesterday, 'Asia/Tokyo', 'yyyy-MM-dd');

    // --- 検索クエリの作成 ---
    // 例: "to:<USER_ID> after:2024-01-01 before:2024-01-02"
    const query = `to:<@${userId}> after:${dateString}`;

    // --- Slack検索APIの実行 ---
    const messages = searchSlackMessages(userToken, query);

    if (messages.length === 0) {
        postToSlack(webhookUrl, `昨日（${dateString}）のメンションはありませんでした。☕`);
        return;
    }

    // --- チャンネルの集計 ---
    const channelList = aggregateMentions(messages);

    // --- メッセージの作成 ---
    const reportMessage = [
        `📅 *昨日（${dateString}）のメンション集計*`,
        `以下のチャンネルでメンションが届いていました：\n`,
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
 * Slack Search API を使用してメッセージを検索する。
 */
function searchSlackMessages(token: string, query: string): any[] {
    const url = `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=100`;
    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'get',
        headers: { Authorization: `Bearer ${token}` },
        muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(url, options);
    const resJson = JSON.parse(response.getContentText());

    if (!resJson.ok) {
        Logger.log(`Slack API Error: ${resJson.error}`);
        return [];
    }

    return resJson.messages.matches || [];
}

/**
 * 検索結果からユニークなチャンネルリストを作成する。
 */
function aggregateMentions(messages: any[]): { id: string; name: string }[] {
    const channelMap = new Map<string, string>();

    messages.forEach((msg) => {
        if (msg.channel && msg.channel.id) {
            channelMap.set(msg.channel.id, msg.channel.name);
        }
    });

    const list: { id: string; name: string }[] = [];
    channelMap.forEach((name, id) => {
        list.push({ id, name });
    });

    return list;
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
