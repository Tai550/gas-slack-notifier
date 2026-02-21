/**
 * SlackNotifier.ts
 *
 * GASスクリプトプロパティからSlack Webhook URLを取得し、
 * スプレッドシートのデータを整形してSlackに通知するモジュール。
 */

// ============================================================
// 定数・設定
// ============================================================

/** スクリプトプロパティのキー名 */
const WEBHOOK_PROPERTY_KEY = 'SLACK_WEBHOOK_URL_test';

/** 対象スプレッドシートID（GASエディタで実際のIDに書き換えてください） */
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

/** 対象シート名 */
const SHEET_NAME = 'Sheet1';

// ============================================================
// メイン通知関数
// ============================================================

/**
 * スプレッドシートからデータを取得し、Slackに通知を送信する。
 * トリガーから呼び出されるエントリポイント関数。
 */
function sendSlackNotification(): void {
  // --- Webhook URL の取得 ---
  const webhookUrl = PropertiesService.getScriptProperties().getProperty(WEBHOOK_PROPERTY_KEY);

  if (!webhookUrl) {
    Logger.log(
      `エラー: スクリプトプロパティ "${WEBHOOK_PROPERTY_KEY}" が設定されていません。` +
        'GASエディタ > プロジェクトの設定 > スクリプトプロパティ から登録してください。',
    );
    return;
  }

  // --- スプレッドシートからデータ取得 ---
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);

  if (!sheet) {
    Logger.log(`エラー: シート "${SHEET_NAME}" が見つかりません。`);
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('データが存在しません（ヘッダー行のみ）。');
    return;
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  const rows = dataRange.getValues();

  // --- データを整形 ---
  const message = formatSlackMessage(rows);

  // --- Slackに送信 ---
  postToSlack(webhookUrl, message);
}

// ============================================================
// ヘルパー関数
// ============================================================

/**
 * 2次元配列のスプレッドシートデータをSlack向けテキストに整形する。
 *
 * @param rows - スプレッドシートの行データ（ヘッダー行を除く）
 * @returns 整形済みのSlackメッセージ文字列
 */
function formatSlackMessage(rows: unknown[][]): string {
  const lines: string[] = ['📊 *スプレッドシート更新通知*\n'];

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const formatted = row
      .map((cell) => {
        if (typeof cell === 'number') {
          // パーセンテージ表示（0〜1の小数をパーセントに変換）
          if (cell > 0 && cell < 1) {
            return `${(cell * 100).toFixed(1)}%`;
          }
          // 人数など整数表示
          if (Number.isInteger(cell)) {
            return `${cell.toLocaleString()}人`;
          }
          return cell.toFixed(2);
        }
        return String(cell);
      })
      .join(' | ');

    lines.push(`*Row ${rowNumber}:* ${formatted}`);
  });

  lines.push(`\n_最終更新: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}_`);

  return lines.join('\n');
}

/**
 * Slack Incoming Webhook にメッセージをPOST送信する。
 *
 * @param webhookUrl - Slack Webhook URL
 * @param text       - 送信するメッセージ本文
 */
function postToSlack(webhookUrl: string, text: string): void {
  const payload = JSON.stringify({ text });

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    payload,
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(webhookUrl, options);
  const statusCode = response.getResponseCode();

  if (statusCode === 200) {
    Logger.log('✅ Slack通知の送信に成功しました。');
  } else {
    Logger.log(
      `❌ Slack通知の送信に失敗しました。ステータスコード: ${statusCode}, レスポンス: ${response.getContentText()}`,
    );
  }
}

// ============================================================
// トリガー管理
// ============================================================

/**
 * 既存の sendSlackNotification トリガーをすべて削除してから、
 * 5分間隔の時限トリガーを新規登録する。
 */
function setTestTrigger(): void {
  // 既存トリガーの削除
  deleteTriggers();

  // 新規トリガーの登録（5分間隔）
  ScriptApp.newTrigger('sendSlackNotification').timeBased().everyMinutes(5).create();

  Logger.log('✅ 5分間隔トリガーを登録しました。');
}

/**
 * sendSlackNotification 関数に紐付いたトリガーをすべて削除する。
 */
function deleteTriggers(): void {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;

  triggers.forEach((trigger) => {
    if (trigger.getHandlerFunction() === 'sendSlackNotification') {
      ScriptApp.deleteTrigger(trigger);
      deletedCount++;
    }
  });

  Logger.log(`🗑️ ${deletedCount} 件の既存トリガーを削除しました。`);
}
