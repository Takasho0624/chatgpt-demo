# けいのBAR：音声会話と提供演出

## 2026-09-12 更新（以下の旧仕様・検証履歴より優先）

- MAKING_COCKTAILへの移行・氷SEでRealtime音声をcancel/clear/truncate/muteしません。注文への返事をそのまま再生し、追加の会話リクエストは増やしません。
- 画像は注文から7秒後に表示。提供セリフは直前の生成と音声バッファが終わるまで待ちます。
- MAKING_COCKTAILとSERVINGはマイク/VAD無効。提供セリフが再生完了するとFREE_TALKになり割り込み可能です。
- `src/lib/voice-conversation.mjs`：`COCKTAIL_TIMING`で7秒、SE配列`[2, 5]`、氷音量`iceSoundVolume: 0.25`を設定。
- `src/lib/bar-bgm.mjs`：`BGM_SETTINGS`でBGMパスと音量`0.035`を設定。添付WAV全編をAAC 128kbpsの`public/sounds/JAZZ_pixta_117014742.m4a`（約3.8MB）へ変換。元のWAVと氷WAVは変更しません。
- BGMは開始操作時に専用AudioContextを起動し、読み込み・デコード後にAudioBufferSourceのloopで末尾から先頭へ連続再生します。Realtimeと氷SEはBGMを停止・再開しません。セッション終了時のみ停止。曲自体の先頭・末尾の静けさは素材どおりです。
- 自動テスト19件成功。注文音声を7秒以上再生中として氷2回・画像表示を実行し、cancel/clear/truncateがなく、提供セリフが再生完了まで待つことを確認。BGMの重複開始防止・読み込み中の停止・音量・ループも確認。これは模擬WebRTCテストで、実音声試聴の代わりではありません。

以下は初回実装時の記録です（作成中無言・SERVING割り込みの仕様は上記へ変更）。

## 変更ファイル

- `src/pages/voice.astro`：既存のWebRTC、マイク、注文ツール、画像表示に状態管理を接続。停止・接続終了時の作成タイマーとSEを破棄。
- `src/pages/api/realtime.ts`：初期VADを無効化。日本語読みと、作成中に話さない指示を追加。
- `src/lib/voice-conversation.mjs`：会話状態、マイク/VAD制御、作成時間とSE設定。
- `src/lib/cocktails.mjs`：既存12種の画像・表示名と、独立した日本語読み上げ名。
- `tests/voice-conversation.test.mjs`：状態遷移、再生完了、割り込み、SEタイミング、停止の回帰テスト。
- `tests/voice-page.test.mjs`：実ページのスクリプトを模擬DOM/WebRTCで実行する結合テスト。
- 本書。

UIのHTML/CSS・画像は変更していません。APIキー、モデル、Supabase、認証、環境変数、依存関係の定義とロックファイルも変更していません。

## 会話状態

`OPENING → WAITING_FOR_ORDER → MAKING_COCKTAIL → SERVING → FREE_TALK`

- OPENING：接続準備から挨拶の実再生終了までマイクを無効化。
- WAITING_FOR_ORDER：質問や選択を聞く。けいの応答生成・再生中はマイク無効。
- MAKING_COCKTAIL：注文確定時に応答をキャンセルし音声バッファをクリア。受信済み音声もミュート。マイクとVADを停止し、新規応答を抑制。
- SERVING：画像表示後に移行。「お待たせしました。○○です。どうぞ」と話す。この時点から割り込み可能。
- FREE_TALK：通常のサーバーVADによる自然な割り込みと自動応答。

二杯目のメニューを開いてもFREE_TALKを維持します。二杯目の注文確定時には再びMAKING_COCKTAILに入り、提供後に割り込み可能になります。停止・再接続は新しいOPENINGから開始します。

## 割り込み制御

割り込み禁止期間はMediaStreamTrack.enabledをfalseにして音を送らず、Realtimeのturn_detectionもnullにします。聞き取り中は元のVAD閾値（0.78）、前置300ms、無音850msを維持し、注文前だけinterrupt_responseをfalseにします。

生成終了のresponse.doneと、WebRTCのoutput_audio_buffer.stopped/clearedを別々に追跡します。生成だけ終わっても、再生中ならマイクを再開しません。保護中に遅れて届いたVADイベントは無視します。

SERVING/FREE_TALKではinterrupt_responseとcreate_responseをtrueにし、ユーザー発話でサーバーが音声を中断して次の応答を生成する既存方式を維持します。

公式仕様： https://developers.openai.com/api/docs/guides/realtime-conversations

## 作成時間とSE

`src/lib/voice-conversation.mjs` の `COCKTAIL_TIMING`：

- `preparationSeconds: 7`：注文確定から提供まで7秒。
- `iceSoundAtSeconds: [2, 5]`：作成開始から2秒目と5秒目に同じSEを再生。配列の要素数が再生回数になります。
- `iceSoundSrc: '/sounds/Ice_sound_pixta_44843629.wav'`：提供されたWAVを使用。

提供された `Ice_sound_pixta_44843629.wav` を `public/sounds/Ice_sound_pixta_44843629.wav` にそのまま配置しました。PCM WAV、44.1kHz、24bit、ステレオ、約1.375秒です。2秒目の音は約3.375秒で終了し、5秒目まで約1.625秒の無音を挟みます。2回目は約6.375秒で終了し、7秒目に提供します（読み込み・再生の遅延がない場合）。

再生前に前回のSEを停止するため、後から設定を変えても音が重複しません。提供・停止時はSEとすべての予約タイマーを止めます。作成時間外のタイミングは無視します。素材の読み込み・再生に失敗しても次のSEと提供は継続します。作成中のけいの発話停止は維持しています。

## 日本語読み上げ

`src/lib/cocktails.mjs` の `displayName` と `speechName` を分離しました。既存の表示名は日本語だったため、そのまま維持しています。メニュー画像に含まれる英語表記も変更していません。

全12種：マティーニ、マンハッタン、ギムレット、ダイキリ、サイドカー、ホワイトレディ、ネグローニ、オールドファッションド、ジントニック、モスコミュール、カシスオレンジ、ファジーネーブル。

独立したTTS APIは使われていません。Realtime音声生成へのセッション指示・明示的な応答指示・提供ツール結果にspeechNameを渡します。画面はdisplayNameを参照します。最終的なアクセントは音声モデル依存のため、実音声での確認が必要です。

## 検証

- `node --test tests/*.test.mjs`：12件成功。
- 追加したMJSモジュール・テストのESLint：成功。
- Astroコンパイラでvoice.astroを変換し、ブラウザスクリプトとAPI TypeScriptをesbuildで変換：成功。
- `git diff --check`：成功。
- `npm run build`：サーバー生成は成功。クライアント生成段階で数分進展しないため中断。同じ依存環境の修正前main（4e59b674）でも同じ停止を再現。全体ビルド成功とは判定していません。
- `npm run lint`：不成功。修正前から2808件の指摘があり、修正後のページも既存形式に伴うインデント等を含め全体lintは通っていません。無関係な全体整形はしていません。
- `pnpm install --frozen-lockfile`：既存package.jsonとlockfileの不一致で失敗。検証用にnpmでロックを書かずインストール。TypeScriptは既存lockfileに合わせ5.2.2をローカルにのみ導入。依存定義は未変更。

## 残る確認

実サービスへの認証・有料Realtime接続・実マイクを使った試聴は未実施です。全体ビルド停止・既存lint指摘は別途調査が必要です。

実機では、挨拶中の周囲音、注文前の説明中の声、7秒の無言の作成、提供セリフ中と雑談中の割り込み、作成中の停止と再接続、全12種の発音を確認してください。

氷SE追加時：12件の自動テスト（2秒・5秒・7秒の順序、1回目の後に停止、任意回数設定、実ページの2回再生を含む）、変更モジュール・テストのESLint、Astro/esbuildコンパイル、WAVの配置前後のSHA-256一致を確認。実ブラウザでの試聴は未実施です。
