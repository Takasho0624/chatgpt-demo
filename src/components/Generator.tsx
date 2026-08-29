import { Index, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { useThrottleFn } from 'solidjs-use'
import { generateSignature } from '@/utils/auth'
import { supabase } from '@/utils/supabase'
import MessageItem from './MessageItem'
import SystemRoleSettings from './SystemRoleSettings'
import ErrorMessageItem from './ErrorMessageItem'
import type { ChatMessage, ErrorMessage } from '@/types'
import '../message.css'

export default () => {
  let inputRef: HTMLTextAreaElement

  const [currentSystemRoleSettings, setCurrentSystemRoleSettings] = createSignal('')
  const [systemRoleEditing, setSystemRoleEditing] = createSignal(false)

  // 今回の画面に表示する会話
  const [messageList, setMessageList] = createSignal<ChatMessage[]>([])

  // 過去ログ。画面には表示せず、文脈としてだけ使う
  const [hiddenHistory, setHiddenHistory] = createSignal<ChatMessage[]>([])

  // 永続プロフィール
  const [profileName, setProfileName] = createSignal('')
  const [nameConfirmed, setNameConfirmed] = createSignal(false)
  const [profileMemory, setProfileMemory] = createSignal('')

  const [currentError, setCurrentError] = createSignal<ErrorMessage>()
  const [currentAssistantMessage, setCurrentAssistantMessage] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [controller, setController] = createSignal<AbortController>(null)
  const [isStick, setStick] = createSignal(false)
  const [temperature, setTemperature] = createSignal(0.6)

  const temperatureSetting = (value: number) => {
    setTemperature(value)
  }

  const maxHistoryMessages = parseInt(
    import.meta.env.PUBLIC_MAX_HISTORY_MESSAGES || '9',
  )

  createEffect(() => {
    if (isStick())
      smoothToBottom()
  })

  // -------------------------
  // 敬称ダブり防止
  // -------------------------

  const formatDisplayName = (name: string) => {
    const honorifics = [
      'さん',
      'くん',
      '君',
      'ちゃん',
      '先生',
      'さま',
      '様',
      '氏',
    ]

    const alreadyHasHonorific = honorifics.some(
      honorific => name.endsWith(honorific),
    )

    return alreadyHasHonorific
      ? name
      : `${name}さん`
  }

  // -------------------------
  // 日本時間の挨拶
  // -------------------------

  const getJapaneseGreeting = () => {
    const parts = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(new Date())

    const hour = Number(
      parts.find(part => part.type === 'hour')?.value || '0',
    )

    if (hour >= 5 && hour < 11)
      return 'おはようございます'

    if (hour >= 11 && hour < 18)
      return 'こんにちは'

    return 'こんばんは'
  }

  // -------------------------
  // 会話ログ保存
  // -------------------------

  const saveMessage = async(
    role: 'user' | 'assistant',
    content: string,
  ) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user)
        return

      const { error } = await supabase
        .from('messages')
        .insert({
          user_id: user.id,
          role,
          content,
        })

      if (error)
        console.error('Failed to save message:', error)
    }
    catch (err) {
      console.error('Failed to save message:', err)
    }
  }

  // -------------------------
  // 呼び名をプロフィールへ保存
  // -------------------------

  const saveProfileName = async(name: string) => {
    const cleanName = name
      .replace(/^「|」$/g, '')
      .replace(/^『|』$/g, '')
      .trim()

    if (!cleanName)
      return false

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user)
        return false

      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          display_name: cleanName,
          name_confirmed: true,
          memory: profileMemory() || null,
          updated_at: new Date().toISOString(),
        })

      if (error) {
        console.error('Failed to update name:', error)
        return false
      }

      // この発言からすぐ新しい名前を使えるようにする
      setProfileName(cleanName)
      setNameConfirmed(true)

      return true
    }
    catch (err) {
      console.error('Failed to update name:', err)
      return false
    }
  }

  // -------------------------
  // 呼び名の判定
  // 初回確認にも、途中変更にも対応
  // -------------------------

  const updateNamePreference = async(content: string) => {
    const text = content.trim()

    if (!text)
      return false

    let detectedName = ''

    // ----------------------------------
    // すでに名前が確定している場合
    // 明示的な変更指示だけ拾う
    // ----------------------------------

    if (nameConfirmed()) {
      const renamePatterns = [
        /(?:これからは|今後は|今度から|次から|やっぱり)\s*[「『]?([^」』、。！!？?\n]+?)[」』]?(?:って呼んで|ってよんで|と呼んで|とよんで|で呼んで|でよんで)/,
        /[「『]?([^」』、。！!？?\n]+?)[」』]?(?:って呼んで|ってよんで|と呼んで|とよんで|で呼んで|でよんで)/,
        /(?:これからは|今後は|今度から|次から|やっぱり)\s*[「『]?([^」』、。！!？?\n]+?)[」』]?(?:でお願いします|でいいです|でいいよ|がいいです|がいいよ)/,
      ]

      for (const pattern of renamePatterns) {
        const match = text.match(pattern)

        if (match?.[1]) {
          detectedName = match[1].trim()
          break
        }
      }

      // 「やっぱりショウくんで」など
      if (!detectedName) {
        const shortChangePatterns = [
          /(?:やっぱり|これからは|今後は|今度から|次から)\s*[「『]?([^」』、。！!？?\n]+?)[」』]?(?:で|にして)$/,
        ]

        for (const pattern of shortChangePatterns) {
          const match = text.match(pattern)

          if (match?.[1]) {
            detectedName = match[1].trim()
            break
          }
        }
      }

      if (!detectedName)
        return false

      return await saveProfileName(detectedName)
    }

    // ----------------------------------
    // 初回：Google名のままでよい場合
    // ----------------------------------

    const keepCurrentPatterns = [
      /そのままで/,
      /その名前で/,
      /それでいい/,
      /それでお願いします/,
      /今のままで/,
      /その呼び方で/,
    ]

    if (keepCurrentPatterns.some(pattern => pattern.test(text))) {
      detectedName = profileName()
    }

    // ----------------------------------
    // 初回：本人が名前を指定
    // ----------------------------------

    if (!detectedName) {
      const firstNamePatterns = [
        /(?:私の名前は|名前は|僕は|ぼくは|私は|わたしは)\s*[「『]?([^」』、。！!？?\n]+?)[」』]?(?:です|だよ|だ|といいます|と言います)/,
        /[「『]?([^」』、。！!？?\n]+?)[」』]?(?:って呼んで|ってよんで|と呼んで|とよんで|と呼んでください|とよんでください|で呼んで|でよんで)/,
        /[「『]?([^」』、。！!？?\n]+?)[」』]?(?:でいいです|でいいよ|でお願いします|がいいです|がいいよ)/,
      ]

      for (const pattern of firstNamePatterns) {
        const match = text.match(pattern)

        if (match?.[1]) {
          detectedName = match[1].trim()
          break
        }
      }
    }

    // 初回確認の直後なら、
    // 「テスト太郎」「テスト太郎で」程度の短い返答も名前と判断
    if (!detectedName && text.length <= 30) {
      const candidate = text
        .replace(/^(じゃあ|では|えっと|うん|はい)[、,\s]*/g, '')
        .replace(
          /(でお願いします|でいいです|でいいよ|で|と呼んで|って呼んで|とよんで|ってよんで)$/,
          '',
        )
        .trim()

      if (
        candidate
        && candidate.length <= 20
        && !/[。！!？?]/.test(candidate)
      ) {
        detectedName = candidate
      }
    }

    if (!detectedName)
      return false

    return await saveProfileName(detectedName)
  }

  // -------------------------
  // ユーザー初期化
  // -------------------------

  const initializeUser = async() => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user)
        return

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, memory, name_confirmed')
        .eq('user_id', user.id)
        .maybeSingle()

      if (profileError)
        console.error('Failed to load profile:', profileError)

      let displayName = profile?.display_name || ''
      let confirmed = profile?.name_confirmed || false
      const memory = profile?.memory || ''

      // 初回はGoogleアカウント名を仮の呼び名として保存
      if (!displayName) {
        displayName
          = user.user_metadata?.full_name
          || user.user_metadata?.name
          || user.email?.split('@')[0]
          || 'お客さま'

        const { error } = await supabase
          .from('profiles')
          .upsert({
            user_id: user.id,
            display_name: displayName,
            name_confirmed: false,
            memory: memory || null,
            updated_at: new Date().toISOString(),
          })

        if (error)
          console.error('Failed to create profile:', error)

        confirmed = false
      }

      setProfileName(displayName)
      setNameConfirmed(confirmed)
      setProfileMemory(memory)

      // 過去ログは画面には表示しない
      // 直近だけAIの文脈として裏で保持
      const { data: oldMessages, error: historyError } = await supabase
        .from('messages')
        .select('role, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(maxHistoryMessages)

      if (historyError) {
        console.error('Failed to load history:', historyError)
      }
      else if (oldMessages) {
        const history = [...oldMessages]
          .reverse()
          .map(item => ({
            role: item.role,
            content: item.content,
          })) as ChatMessage[]

        setHiddenHistory(history)
      }

      const greeting = getJapaneseGreeting()

      let openingMessage = ''

      if (confirmed) {
        openingMessage
          = `${greeting}、${formatDisplayName(displayName)}🍸\n今夜もゆっくりしていってね。`
      }
      else {
        openingMessage
          = `${greeting}、${formatDisplayName(displayName)}🍸\n`
          + `${formatDisplayName(displayName)}とお呼びしていいですか？ `
          + 'それとも、ニックネームや別の呼び名がありますか？'
      }

      setMessageList([
        {
          role: 'assistant',
          content: openingMessage,
        },
      ])
    }
    catch (err) {
      console.error('Failed to initialize user:', err)
    }
  }

  // -------------------------
  // 起動
  // -------------------------

  onMount(async() => {
    let lastPosition = window.scrollY

    window.addEventListener('scroll', () => {
      const nowPosition = window.scrollY

      if (nowPosition < lastPosition)
        setStick(false)

      lastPosition = nowPosition
    })

    try {
      if (sessionStorage.getItem('systemRoleSettings')) {
        setCurrentSystemRoleSettings(
          sessionStorage.getItem('systemRoleSettings') || '',
        )
      }

      if (localStorage.getItem('stickToBottom') === 'stick')
        setStick(true)
    }
    catch (err) {
      console.error(err)
    }

    await initializeUser()

    window.addEventListener('beforeunload', handleBeforeUnload)

    onCleanup(() => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    })
  })

  const handleBeforeUnload = () => {
    sessionStorage.setItem(
      'systemRoleSettings',
      currentSystemRoleSettings(),
    )

    if (isStick())
      localStorage.setItem('stickToBottom', 'stick')
    else
      localStorage.removeItem('stickToBottom')
  }

  // -------------------------
  // ユーザー送信
  // -------------------------

  const handleButtonClick = async() => {
    const inputValue = inputRef.value.trim()

    if (!inputValue)
      return

    inputRef.value = ''
    inputRef.style.height = 'auto'

    setMessageList([
      ...messageList(),
      {
        role: 'user',
        content: inputValue,
      },
    ])

    await saveMessage('user', inputValue)

    // 初回確認・途中変更の両方に対応
    await updateNamePreference(inputValue)

    await requestWithLatestMessage()

    instantToBottom()
  }

  const smoothToBottom = useThrottleFn(() => {
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'smooth',
    })
  }, 300, false, true)

  const instantToBottom = () => {
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: 'instant',
    })
  }

  // -------------------------
  // AIリクエスト
  // -------------------------

  const requestWithLatestMessage = async() => {
    setLoading(true)
    setCurrentAssistantMessage('')
    setCurrentError(null)

    const storagePassword = localStorage.getItem('pass')

    try {
      const controller = new AbortController()
      setController(controller)

      // 最初の自動挨拶はAIに渡さない
      const visibleMessages = messageList().filter((message, index) => {
        return index !== 0
      })

      const allMessages = [
        ...hiddenHistory(),
        ...visibleMessages,
      ]

      const requestMessageList
        = allMessages.slice(-maxHistoryMessages)

      let profileContext = ''

      // 現在の確定済み呼び名を最優先
      if (nameConfirmed() && profileName()) {
        profileContext +=
          `このユーザーの現在の希望する呼び名は「${formatDisplayName(profileName())}」。`
          + '以前の会話に別の呼び名が書かれていても無視し、必ず現在の呼び名を使ってください。'
          + 'ユーザーが会話中に新しい呼び名を希望した場合は、その新しい呼び名を尊重してください。'
      }

      if (profileMemory()) {
        profileContext +=
          `\nこのユーザーについて記憶していること:\n${profileMemory()}`
      }

      if (currentSystemRoleSettings()) {
        profileContext +=
          `\n\n${currentSystemRoleSettings()}`
      }

      if (profileContext) {
        requestMessageList.unshift({
          role: 'system',
          content: profileContext,
        })
      }

      const timestamp = Date.now()

      const response = await fetch('/api/generate', {
        method: 'POST',
        body: JSON.stringify({
          messages: requestMessageList,
          time: timestamp,
          pass: storagePassword,
          sign: await generateSignature({
            t: timestamp,
            m:
              requestMessageList?.[
                requestMessageList.length - 1
              ]?.content || '',
          }),
          temperature: temperature(),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const error = await response.json()

        console.error(error.error)
        setCurrentError(error.error)

        throw new Error('Request failed')
      }

      const data = response.body

      if (!data)
        throw new Error('No data')

      const reader = data.getReader()
      const decoder = new TextDecoder('utf-8')

      let done = false

      while (!done) {
        const {
          value,
          done: readerDone,
        } = await reader.read()

        if (value) {
          const char = decoder.decode(value)

          if (
            char === '\n'
            && currentAssistantMessage().endsWith('\n')
          )
            continue

          if (char) {
            setCurrentAssistantMessage(
              currentAssistantMessage() + char,
            )
          }

          if (isStick())
            instantToBottom()
        }

        done = readerDone
      }
    }
    catch (e) {
      console.error(e)

      setLoading(false)
      setController(null)

      return
    }

    await archiveCurrentMessage()

    if (isStick())
      instantToBottom()
  }

  // -------------------------
  // AI返答確定
  // -------------------------

  const archiveCurrentMessage = async() => {
    const assistantMessage = currentAssistantMessage()

    if (!assistantMessage)
      return

    setMessageList([
      ...messageList(),
      {
        role: 'assistant',
        content: assistantMessage,
      },
    ])

    await saveMessage(
      'assistant',
      assistantMessage,
    )

    setCurrentAssistantMessage('')
    setLoading(false)
    setController(null)

    if (!(
      'ontouchstart' in document.documentElement
      || navigator.maxTouchPoints > 0
    )) {
      inputRef.focus()
    }
  }

  // -------------------------
  // この会話をリセット
  // 保存済みプロフィール・過去ログは消さない
  // -------------------------

  const clear = () => {
    inputRef.value = ''
    inputRef.style.height = 'auto'

    setCurrentAssistantMessage('')
    setCurrentError(null)

    const greeting = getJapaneseGreeting()

    const openingMessage = nameConfirmed() && profileName()
      ? `${greeting}、${formatDisplayName(profileName())}🍸\nさて、今夜は何のお話をしましょう？`
      : `${greeting}🍸`

    setMessageList([
      {
        role: 'assistant',
        content: openingMessage,
      },
    ])
  }

  const stopStreamFetch = () => {
    if (controller()) {
      controller().abort()
      archiveCurrentMessage()
    }
  }

  const retryLastFetch = () => {
    if (messageList().length > 0) {
      const lastMessage
        = messageList()[messageList().length - 1]

      if (lastMessage.role === 'assistant')
        setMessageList(messageList().slice(0, -1))

      requestWithLatestMessage()
    }
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.isComposing || e.shiftKey)
      return

    if (e.key === 'Enter') {
      e.preventDefault()
      handleButtonClick()
    }
  }

  return (
    <div my-6>
      <SystemRoleSettings
        canEdit={() => messageList().length <= 1}
        systemRoleEditing={systemRoleEditing}
        setSystemRoleEditing={setSystemRoleEditing}
        currentSystemRoleSettings={currentSystemRoleSettings}
        setCurrentSystemRoleSettings={setCurrentSystemRoleSettings}
        temperatureSetting={temperatureSetting}
      />

      <Index each={messageList()}>
        {(message, index) => (
          <MessageItem
            role={message().role}
            message={message().content}
            showRetry={() =>
              (
                message().role === 'assistant'
                && index === messageList().length - 1
              )
            }
            onRetry={retryLastFetch}
          />
        )}
      </Index>

      {currentAssistantMessage() && (
        <MessageItem
          role="assistant"
          message={currentAssistantMessage}
        />
      )}

      {
        currentError()
        && (
          <ErrorMessageItem
            data={currentError()}
            onRetry={retryLastFetch}
          />
        )
      }

      <Show
        when={!loading()}
        fallback={() => (
          <div class="gen-cb-wrapper">
            <span>AI is thinking...</span>

            <div
              class="gen-cb-stop"
              onClick={stopStreamFetch}
            >
              Stop
            </div>
          </div>
        )}
      >
        <div
          class="gen-text-wrapper flex-col sm:flex-row"
          class:op-50={systemRoleEditing()}
        >
          <textarea
            ref={inputRef!}
            disabled={systemRoleEditing()}
            onKeyDown={handleKeydown}
            placeholder="Enter something..."
            autocomplete="off"
            autofocus
            onInput={() => {
              inputRef.style.height = 'auto'
              inputRef.style.height
                = `${inputRef.scrollHeight}px`
            }}
            rows="1"
            class="gen-textarea w-full min-h-20"
          />

          <button
            onClick={handleButtonClick}
            disabled={systemRoleEditing()}
            gen-slate-btn
            class="flex-shrink-0"
          >
            送信
          </button>

          <button
            title="この会話をリセット"
            onClick={clear}
            disabled={systemRoleEditing()}
            gen-slate-btn
            class="flex-shrink-0"
          >
            この会話をリセット
          </button>
        </div>
      </Show>

      <div
        class="fixed bottom-5 left-5 rounded-md hover:bg-slate/10 w-fit h-fit transition-colors active:scale-90"
        class:stick-btn-on={isStick()}
      >
        <div>
          <button
            class="p-2.5 text-base"
            title="stick to bottom"
            type="button"
            onClick={() => setStick(!isStick())}
          >
            <div i-ph-arrow-line-down-bold />
          </button>
        </div>
      </div>
    </div>
  )
}
