// 音量ベースの口開閉だけを調整する値。attack/release/smoothing は秒あたりの追従速度。
const LIP_SYNC = {
  threshold: 0.015,
  gain: 9,
  maxOpenRatio: 0.76,
  attack: 20,
  release: 8,
  smoothing: 28,
} as const;

// /voice と同じ /api/realtime → WebRTC → remote <audio> の経路をテストページで使う。
let peer: RTCPeerConnection | null = null;
let microphone: MediaStream | null = null;
let channel: RTCDataChannel | null = null;
let context: AudioContext | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let samples: Float32Array | null = null;
let audio: HTMLAudioElement;
let connection: HTMLElement;
let startButton: HTMLButtonElement;
let stopButton: HTMLButtonElement;
let demoTime: HTMLElement;
let mouthLevel = 0;
let outputRms = 0;
let smoothedRms = 0;
let connecting = false;
let demoStartedAt = 0;
let demoClock: number | null = null;
let demoExpired = false;
let introState: 'idle' | 'playing' | 'server-stopped' | 'finished' | 'failed' = 'idle';
let introResponseId: string | null = null;
let introResponseCompleted = false;
let introHeard = false;
let introLastSoundAt = 0;
let introServerStoppedAt = 0;
const completedCalls = new Set<string>();

function updateDemoClock(): void {
  if (!demoStartedAt || demoExpired) return;
  const elapsed = Date.now() - demoStartedAt;
  if (elapsed >= 10 * 60_000) {
    demoExpired = true;
    if (demoClock !== null) window.clearInterval(demoClock);
    demoClock = null;
    stopRealtimeTest();
    startButton.disabled = true;
    demoTime.textContent = '10分の公開デモが終了しました。';
    connection.textContent = 'デモ終了';
  } else if (elapsed >= 9 * 60_000) {
    demoTime.textContent = '残り1分です';
  }
}

function beginDemoClock(): void {
  if (demoStartedAt) return;
  demoStartedAt = Date.now();
  demoClock = window.setInterval(updateDemoClock, 1000);
}

function finishIntroduction(): void {
  if (introState !== 'server-stopped' || !introResponseCompleted || !introHeard || !introLastSoundAt) return;
  if (performance.now() - introLastSoundAt < 450) return;
  microphone?.getAudioTracks().forEach(track => { track.enabled = true; });
  introState = 'finished';
  connection.textContent = 'つながったよ🎙️ 話しかけてね';
}

function japanTime() {
  const now = new Date();
  const currentTime = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(now);
  const hour = Number(new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: 'numeric', hourCycle: 'h23',
  }).formatToParts(now).find(part => part.type === 'hour')?.value);
  return { currentTime, currentHour: hour };
}

function clearRemoteAudio(): void {
  source?.disconnect();
  source = null;
  analyser = null;
  samples = null;
  outputRms = 0;
  audio.pause();
  audio.srcObject = null;
}

export function stopRealtimeTest(): void {
  connecting = false;
  introState = 'idle';
  introResponseId = null;
  introResponseCompleted = false;
  introHeard = false;
  introLastSoundAt = 0;
  introServerStoppedAt = 0;
  channel?.close();
  channel = null;
  peer?.close();
  peer = null;
  microphone?.getTracks().forEach(track => track.stop());
  microphone = null;
  clearRemoteAudio();
  void context?.suspend();
  completedCalls.clear();
  startButton.disabled = demoExpired;
  stopButton.disabled = true;
  connection.textContent = '会話終了。もう一度開始できます';
  // Live2D側の描画ループが mouthLevel を滑らかに 0 に戻す。
}

function send(event: object): void {
  if (channel?.readyState === 'open') channel.send(JSON.stringify(event));
}

async function handleToolCall(message: { name?: string; call_id?: string; arguments?: string }): Promise<void> {
  const callId = message.call_id;
  if (!callId || completedCalls.has(callId)) return;
  completedCalls.add(callId);
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(message.arguments || '{}'); } catch { /* empty output below */ }
  let output = '';
  if (message.name === 'search_web') {
    connection.textContent = '調べてるよ…';
    try {
      const response = await fetch('/api/web-search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: typeof args.query === 'string' ? args.query.trim() : '' }),
      });
      const result = await response.json();
      output = response.ok && typeof result.answer === 'string' ? result.answer :
        'Web検索を試しましたが、情報を取得できませんでした。';
    } catch { output = 'Web検索中にエラーが発生しました。'; }
  } else if (message.name === 'serve_cocktail') {
    // このページはモデルと音声のテストのみ。関数呼び出しを完了して会話を継続する。
    output = JSON.stringify({ success: false, reason: 'Live2Dテストページではカクテル提供を表示できません' });
  } else return;
  send({ type: 'conversation.item.create', item: {
    type: 'function_call_output', call_id: callId, output,
  } });
  send({ type: 'response.create' });
  connection.textContent = 'つながったよ🎙️ 話しかけてね';
}

async function startRealtimeTest(): Promise<void> {
  if (connecting || peer || demoExpired) return;
  connecting = true;
  startButton.disabled = true;
  connection.textContent = '接続中…マイクを許可してください';
  try {
    // ボタン操作から音声再生を開始できるよう、/voice と同じ AudioContext を再開する。
    context ??= new AudioContext();
    await context.resume();
    const tokenResponse = await fetch('/api/realtime', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicDemo: true, displayName: 'お客様', memory: '', ...japanTime() }),
    });
    if (!tokenResponse.ok) throw new Error(`Realtime token: ${tokenResponse.status} ${await tokenResponse.text()}`);
    const tokenData = await tokenResponse.json();
    const ephemeralKey = tokenData.value || tokenData.client_secret?.value || tokenData.client_secret;
    if (typeof ephemeralKey !== 'string' || !ephemeralKey) throw new Error('Realtime token がありません');

    peer = new RTCPeerConnection();
    peer.onconnectionstatechange = () => {
      if (peer?.connectionState === 'failed' || peer?.connectionState === 'disconnected') {
        connection.textContent = '音声接続が切れました';
        stopRealtimeTest();
      }
    };
    peer.ontrack = async event => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      audio.srcObject = stream;
      try { await audio.play(); }
      catch (error) {
        console.warn('Audio play error:', error);
        connection.textContent = '音声再生がブロックされました。会話を再開してください';
      }
      source?.disconnect();
      analyser = context!.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.7;
      samples = new Float32Array(analyser.fftSize);
      source = context!.createMediaStreamSource(stream);
      source.connect(analyser);
      // 再生は remote-audio が担当する。Analyser を destination に接続して二重再生しない。
    };
    microphone = await navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    } });
    // 冒頭はWebRTC接続を維持したまま無音を送る。VADによるresponse cancelを防ぐ。
    microphone.getAudioTracks().forEach(track => { track.enabled = false; });
    introState = 'playing';
    introResponseId = null;
    introResponseCompleted = false;
    introHeard = false;
    introLastSoundAt = 0;
    introServerStoppedAt = 0;
    microphone.getTracks().forEach(track => peer!.addTrack(track, microphone!));
    channel = peer.createDataChannel('oai-events');
    channel.onopen = () => {
      connecting = false;
      stopButton.disabled = false;
      beginDemoClock();
      connection.textContent = 'けいが挨拶しています。終わったら話しかけてください';
      send({ type: 'response.create', response: { instructions:
        `お客様が来店しました。現在の日本時間は「${japanTime().currentTime}」です。最初の発話は必ずこの順番で、時間帯に合う短い挨拶、「AIバー、ボイスアンドモルトのけいです。」、「どうお呼びすればよろしいですか？」を続けて話してください。希望する呼ばれ方はまだ分からないので、固定名は使いません。呼び方は最初の一回だけ尋ね、落ち着いたバーの接客口調にしてください。`,
      } });
    };
    channel.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (introState === 'playing' && message.type === 'response.created' && !introResponseId) {
          introResponseId = message.response?.id ?? null;
        }
        if ((introState === 'playing' || introState === 'server-stopped') && message.type === 'response.done' &&
            message.response?.id === introResponseId) {
          if (message.response?.status === 'completed') introResponseCompleted = true;
          else {
            introState = 'failed';
            connection.textContent = '冒頭の挨拶が中断されました。会話を終了して再試行してください';
          }
        }
        if (introState === 'playing' && message.type === 'output_audio_buffer.cleared' &&
            message.response_id === introResponseId) {
          introState = 'failed';
          connection.textContent = '冒頭の挨拶が中断されました。会話を終了して再試行してください';
        }
        if (introState === 'playing' && message.type === 'output_audio_buffer.stopped' &&
            message.response_id === introResponseId) {
          introState = 'server-stopped';
          introServerStoppedAt = performance.now();
        }
        if (introState === 'finished' && message.type === 'input_audio_buffer.speech_started') connection.textContent = 'うんうん…';
        if (introState === 'finished' && message.type === 'input_audio_buffer.speech_stopped') connection.textContent = 'ちょっと考えてる…';
        if (message.type === 'response.function_call_arguments.done') void handleToolCall(message);
        if (message.type === 'error') {
          console.error('Realtime API error:', message);
          connection.textContent = '音声APIでエラーが出ました';
        }
      } catch (error) { console.error('Realtime event error:', error); }
    };
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const answer = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST', headers: { Authorization: `Bearer ${ephemeralKey}`, 'Content-Type': 'application/sdp' },
      body: peer.localDescription!.sdp,
    });
    if (!answer.ok) throw new Error(`Realtime SDP: ${answer.status} ${await answer.text()}`);
    await peer.setRemoteDescription({ type: 'answer', sdp: await answer.text() });
  } catch (error) {
    console.error('Live2D Realtime start error:', error);
    stopRealtimeTest();
    connection.textContent = error instanceof Error ? `接続できませんでした: ${error.message}` : '接続できませんでした';
  }
}

export function getRealtimeMouthLevel(dt: number): number {
  outputRms = 0;
  if (analyser && samples && !audio.paused && !audio.muted && context?.state === 'running') {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    outputRms = Math.sqrt(sum / samples.length);
  }
  if (introState === 'playing' || introState === 'server-stopped') {
    if (outputRms > LIP_SYNC.threshold) {
      introHeard = true;
      introLastSoundAt = performance.now();
    }
    if (introState === 'server-stopped' && performance.now() - introServerStoppedAt > 250) finishIntroduction();
  }
  // 実音声RMSを短時間だけ平滑化。無音時の残響も時間ベースで減衰する。
  smoothedRms += (outputRms - smoothedRms) * (1 - Math.exp(-LIP_SYNC.smoothing * dt));
  const audible = Math.max(0, Math.min(1, (smoothedRms - LIP_SYNC.threshold) * LIP_SYNC.gain));
  // threshold直上はほぼ閉口。通常会話の上限はmoc3の口開閉範囲の76%。
  const target = LIP_SYNC.maxOpenRatio * Math.pow(audible, 1.5);
  const speed = target > mouthLevel ? LIP_SYNC.attack : LIP_SYNC.release;
  mouthLevel += (target - mouthLevel) * (1 - Math.exp(-speed * dt));
  if (target === 0 && mouthLevel < 0.002) mouthLevel = 0;
  return mouthLevel;
}

export function getRealtimeOutputRms(): number { return outputRms; }

export async function initializeRealtimeTest(): Promise<void> {
  audio = document.querySelector<HTMLAudioElement>('#remote-audio')!;
  connection = document.querySelector<HTMLElement>('#connection')!;
  startButton = document.querySelector<HTMLButtonElement>('#start-voice')!;
  stopButton = document.querySelector<HTMLButtonElement>('#stop-voice')!;
  demoTime = document.querySelector<HTMLElement>('#demo-time')!;
  startButton.addEventListener('click', () => { void startRealtimeTest(); });
  stopButton.addEventListener('click', stopRealtimeTest);
  window.addEventListener('beforeunload', stopRealtimeTest);
  connection.textContent = 'けいと話す（マイク許可が必要です）';
  startButton.disabled = demoExpired;
}
