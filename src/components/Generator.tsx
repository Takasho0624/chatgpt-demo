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

  // 今この画面に表示している会話だけ
  const [messageList, setMessageList] = createSignal<ChatMessage[]>([])

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
  // メッセージをSupabaseへ保存
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
  // 呼び名の初回設定・途中変更
  // -------------------------

  const updateNamePreference = async(content: string) => {
    const text = content.trim()

    if (!text)
      return false

    let detectedName = ''

    // すでに呼び名が確定している場合は、
    // 明示的な変更指示だけを拾う
    if (nameConfirmed()) {
      const renamePatterns = [
        /(?:これからは|今後は|今度から|次から|やっぱり)\s*[「『]?([^」』、。！!？?\n]+?)[」』]?(?:って呼んで|ってよんで|と呼んで|とよんで|で呼んで|でよんで)/,
        /[「『]?([^」』、。！!？?\n]+?)[」』]?(?:って呼んで|ってよんで|と呼んで|とよんで|で呼んで|でよんで)/,
        /(?:これからは|今後は|今度から|次から|やっぱり)\s*[「『]?([^」』、。！!？?\n]+?)[」』]?(?:でお願いします|でいいです|でいいよ|がいいです|がいいよ)/,
        /(?:やっぱり|これからは|今後は|今度から|次から)\s*[「『]?([^」』、。！!？?\n]+?)[」』]?(?:で|にして)$/,
      ]

      for (const pattern of renamePatterns) {
        const match = text.match(pattern)

        if (match?.[1]) {
          detectedName = match[1].trim()
          break
        }
      }

      if (!detectedName)
        return false

      return await saveProfileName(detectedName)
    }

    // 初回。「今のGoogle名でいい」という返答
    const keepCurrentPatterns = [
      /そのままで/,
      /その名前で/,
      /それでいい/,
      /それでお願いします/,
      /今のままで/,
      /その呼び方で/,
    ]

    if (keepCurrentPatterns.some(pattern => pattern.test(text)))
      detectedName = profileName()

    // 初回。別の呼び名を指定
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

    // 初回確認直後の
    // 「テスト太郎」「テスト太郎で」なども拾う
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
  // 長期記憶をSupabaseへ保存
  // -------------------------

  const saveMemory = async(memory: string) => {
    const cleanMemory = memory.trim()

    if (!cleanMemory)
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
          display_name: profileName() || null,
          name_confirmed: nameConfirmed(),
          memory: cleanMemory,
          updated_at: new Date().toISOString(),
        })

      if (error) {
        console.error('Failed to save memory:', error)
        return
      }

      setProfileMemory(cleanMemory)
    }
    catch (err) {
      console.error('Failed to save memory:', err)
    }
  }

  // -------------------------
  // 長期記憶をAIで更新
  // -------------------------

  const updateLongTermMemory = async(
    latestUserMessage: string,
    latestAssistantMessage: string,
  ) => {
    try {
      if (!latestUserMessage)
        return

      const recentMessages = [
        ...messageList()
          .filter((message, index) => index !== 0)
          .slice(-6),
        {
          role: 'assistant',
          content: latestAssistantMessage,
        },
      ]

      const timestamp = Date.now()

      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latestMessage: latestUserMessage,
          currentMemory: profileMemory(),
          recentMessages,
          time: timestamp,
          sign: await generateSignature({
            t: timestamp,
            m: latestUserMessage,
          }),
        }),
      })

      if (!response.ok) {
        console.error(
          'Memory update failed:',
          await response.text(),
        )
        return
      }

      const data = await response.json()

      if (data?.memory)
        await saveMemory(data.memory)
    }
    catch (err) {
      console.error('Failed to update long-term memory:', err)
    }
  }

  // -------------------------
  // 既存ログから初回の長期記憶を作る
  // -------------------------

  const bootstrapMemoryFromOldMessages = async() => {
    // すでに長期記憶があるなら何もしない
    if (profileMemory())
      return

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user)
        return

      // 最初の移行時だけ、最近の保存済みログを読む
      const { data: oldMessages, error } = await supabase
        .from('messages')
        .select('role, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        console.error('Failed to load old messages:', error)
        return
      }

      if (!oldMessages || oldMessages.length === 0)
        return

      const recentMessages = [...oldMessages]
        .reverse()
        .map(item => ({
          role: item.role,
          content: item.content,
        }))

      const latestUserMessage = [...recentMessages]
        .reverse()
        .find(message => message.role === 'user')
        ?.content

      if (!latestUserMessage)
        return

      const timestamp = Date.now()

      const response = await fetch('/api/memory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latestMessage: latestUserMessage,
          currentMemory: '',
          recentMessages,
          time: timestamp,
          sign: await generateSignature({
            t: timestamp,
            m: latestUserMessage,
          }),
        }),
      })

      if (!response.ok) {
        console.error(
          'Initial memory creation failed:',
          await response.text(),
        )
        return
      }

      const data = await response.json()

      if (data?.memory)
        await saveMemory(data.memory)
    }
    catch (err) {
      console.error('Failed to bootstrap memory:', err)
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

      // 初回はGoogleアカウント名を仮名として保存
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

      // 既存ユーザーでmemoryがまだ空なら、
      // 過去ログから一度だけ長期記憶を作る
      if (!memory)
        await bootstrapMemoryFromOldMessages()

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

      // 過去ログは表示しない
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

    // 初回でも途中でも呼び名変更を確認
    await updateNamePreference(inputValue)

    await requestWithLatestMessage(inputValue)

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
  // AIへ会話リクエスト
  // -------------------------

  const requestWithLatestMessage = async(
    latestUserMessage: string,
  ) => {
    setLoading(true)
    setCurrentAssistantMessage('')
    setCurrentError(null)

    const storagePassword = localStorage.getItem('pass')

    try {
      const controller = new AbortController()
      setController(controller)

      // 今回の画面で交わしている会話だけ。
      // 過去ログそのものは送らない。
      const currentConversation = messageList()
        .filter((message, index) => index !== 0)
        .slice(-maxHistoryMessages)

      const requestMessageList = [
        ...currentConversation,
      ]

      let profileContext = ''

      // 現在の呼び名を伝える
      if (nameConfirmed() && profileName()) {
        profileContext +=
          `このユーザーの現在の希望する呼び名は「${formatDisplayName(profileName())}」。`
          + '以前の情報に別の呼び名があっても、現在の呼び名を優先してください。'
      }

      // 長期記憶を伝える
      if (profileMemory()) {
        profileContext +=
          `\n\nこのユーザーについて長期的に記憶していること:\n${profileMemory()}`
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
            m: latestUserMessage,
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

    await archiveCurrentMessage(latestUserMessage)

    if (isStick())
      instantToBottom()
  }

  // -------------------------
  // AI返答確定
  // -------------------------

  const archiveCurrentMessage = async(
    latestUserMessage: string,
  ) => {
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

    // 会話が1往復終わるたび、
    // 長期記憶を静かに更新
    await updateLongTermMemory(
      latestUserMessage,
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
  // 名前・長期記憶・保存ログは消さない
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

      const latestUserMessage = [...messageList()]
        .reverse()
        .find(message => message.role === 'user')
        ?.content || ''

      archiveCurrentMessage(latestUserMessage)
    }
  }

  const retryLastFetch = () => {
    if (messageList().length > 0) {
      const lastMessage
        = messageList()[messageList().length - 1]

      if (lastMessage.role === 'assistant')
        setMessageList(messageList().slice(0, -1))

      const latestUserMessage = [...messageList()]
        .reverse()
        .find(message => message.role === 'user')
        ?.content || ''

      if (latestUserMessage)
        requestWithLatestMessage(latestUserMessage)
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
