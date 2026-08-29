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

  const [messageList, setMessageList] = createSignal<ChatMessage[]>([])
  const [hiddenHistory, setHiddenHistory] = createSignal<ChatMessage[]>([])

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
  // 初回の呼び名確認
  // -------------------------

  const confirmNamePreference = async(content: string) => {
    if (nameConfirmed())
      return

    const text = content.trim()

    if (!text)
      return

    let detectedName = ''

    const keepCurrentPatterns = [
      /そのままで/,
      /その名前で/,
      /それでいい/,
      /それでお願いします/,
      /今のままで/,
    ]

    if (keepCurrentPatterns.some(pattern => pattern.test(text))) {
      detectedName = profileName()
    }

    if (!detectedName) {
      const patterns = [
        /(?:私の名前は|名前は|僕は|ぼくは|私は|わたしは)\s*[「『]?([^」』、。！!？?\n]+?)[」』]?(?:です|だよ|だ|といいます|と言います)/,
        /[「『]?([^」』、。！!？?\n]+?)[」』]?(?:って呼んで|と呼んで|と呼んでください|で呼んで)/,
        /[「『]?([^」』、。！!？?\n]+?)[」』]?(?:でいいです|でいいよ|でお願いします|がいいです|がいいよ)/,
      ]

      for (const pattern of patterns) {
        const match = text.match(pattern)

        if (match?.[1]) {
          detectedName = match[1].trim()
          break
        }
      }
    }

    if (!detectedName && text.length <= 30) {
      let candidate = text
        .replace(/^(じゃあ|では|えっと|うん|はい)[、,\s]*/g, '')
        .replace(/(でお願いします|でいいです|でいいよ|で|と呼んで|って呼んで)$/g, '')
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
      return

    detectedName = detectedName
      .replace(/^「|」$/g, '')
      .replace(/^『|』$/g, '')
      .trim()

    if (!detectedName)
      return

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user)
        return

      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          display_name: detectedName,
          name_confirmed: true,
          memory: profileMemory() || null,
          updated_at: new Date().toISOString(),
        })

      if (error) {
        console.error('Failed to update name:', error)
        return
      }

      setProfileName(detectedName)
      setNameConfirmed(true)
    }
    catch (err) {
      console.error('Failed to confirm name:', err)
    }
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

    await confirmNamePreference(inputValue)

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

      if (nameConfirmed() && profileName()) {
        profileContext +=
          `このユーザーの希望する呼び名は「${profileName()}」。`
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
  // 新しい夜
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
            title="新しい夜に戻る"
            onClick={clear}
            disabled={systemRoleEditing()}
            gen-slate-btn
            class="flex-shrink-0"
          >
            新しい夜に戻る
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
