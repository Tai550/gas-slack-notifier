# GAS + TypeScript Slack通知自動化

ローカル環境（PC上）でTypeScriptを用いてGoogle Apps Script（GAS）を開発し、Slackに自動通知を送るプロジェクトです。

## 構成技術

| 技術 | 用途 |
|------|------|
| Google Apps Script (GAS) | 実行環境 |
| TypeScript | 開発言語 |
| clasp | GASデプロイツール |
| ESLint / Prettier | コード品質管理 |
| GASスクリプトプロパティ | シークレット管理 |

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. clasp ログイン & プロジェクト作成

```bash
npx @google/clasp login
npx @google/clasp create --type standalone --title "SlackNotifier"
```

> ⚠️ `clasp create` 実行後、`.clasp.json` の `scriptId` が自動更新されます。

### 3. Google Apps Script API の有効化

[ユーザー設定画面](https://script.google.com/home/usersettings) にアクセスし、「Google Apps Script API」を **オン** にしてください。

### 4. スクリプトプロパティの設定

GASエディタ > プロジェクトの設定 > スクリプトプロパティ から以下を登録：

| キー | 値 |
|------|-----|
| `SLACK_WEBHOOK_URL_test` | `https://hooks.slack.com/services/...` |

### 5. スプレッドシートIDの設定

`src/SlackNotifier.ts` 内の `SPREADSHEET_ID` を対象スプレッドシートのIDに書き換えてください。

## 使い方

### コード整形 & Lint

```bash
npm run format
npm run lint
```

### 型チェック

```bash
npm run typecheck
```

### GASへプッシュ

```bash
npm run push
```

### 整形 → プッシュ（一括）

```bash
npm run format && npm run push
```

## トリガー設定

GASエディタで `setTestTrigger` 関数を実行すると、5分間隔の自動実行トリガーが設定されます。

## ライセンス

ISC
