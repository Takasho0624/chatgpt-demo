import { Index, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import { useThrottleFn } from 'solidjs-use'
import { generateSignature } from '@/utils/auth'
import { supabase } from '@/utils/supabase'
import IconClear from './icons/Clear'
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
  // Supabase：過去ログ読み込み
  // -------------------------

  const loadMessages = async() => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user)
        return

      const { data, error } = await supabase
        .from('messages')
        .select('role, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Failed to load messages:', error)
        return
      }

      if (data) {
        const messages: ChatMessage[] = data.map(item => ({
          role: item.role,
          content: item.content,
        })) as ChatMessage[]

        setMessageList(messages)
      }
    }
    catch (err) {
      console.error('Failed to load messages:', err)
    }
  }

  // -------------------------
  // Supabase：1発言保存
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
  // 初期化
  // -------------------------

  onMount(async() => {
    let lastPostion = window.scrollY

    window.addEventListener('scroll', () => {
      const nowPostion = window.scrollY

      if (nowPostion < lastPostion)
        setStick(false)

      lastPostion = nowPostion
    })

    try {
      if (sessionStorage.getItem('systemRoleSettings'))
        setCurrentSystemRoleSettings(sessionStorage.getItem('systemRoleSettings') || '')

      if (localStorage.getItem('stickToBottom') === 'stick')
        setStick(true)
    }
    catch (err) {
      console.error(err)
    }

    // Googleアカウントに紐づいた過去ログを読み込む
    await loadMessages()

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
  // 送信
  // -------------------------

  const handleButtonClick = async() => {
    const inputValue = inputRef.value

    if (!inputValue)
      return

    inputRef.value = ''

    setMessageList([
      ...messageList(),
      {
        role: 'user',
        content: inputValue,
      },
    ])

    // ユーザー発言をSupabaseへ保存
    await saveMessage('user', inputValue)

    requestWithLatestMessage()
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
  // OpenAIへリクエスト
  // -------------------------

  const requestWithLatestMessage = async() => {
    setLoading(true)
    setCurrentAssistantMessage('')
    setCurrentError(null)

    const storagePassword = localStorage.getItem('pass')

    try {
      const controller = new AbortController()
      setController(controller)

      const requestMessageList = messageList().slice(-maxHistoryMessages)

      if (currentSystemRoleSettings()) {
        requestMessageList.unshift({
          role: 'system',
          content: currentSystemRoleSettings(),
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
            m: requestMessageList?.[
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
  // けいの返答を確定・保存
  // -------------------------

  const archiveCurrentMessage = async() => {
    const assistantMessage = currentAssistantMessage()

    if (assistantMessage) {
      setMessageList([
        ...messageList(),
        {
          role: 'assistant',
          content: assistantMessage,
        },
      ])

      // けいの返答もSupabaseへ保存
      await saveMessage(
        'assistant',
        assistantMessage,
      )

      setCurrentAssistantMessage('')
      setLoading(false)
      setController(null)

      // Disable auto-focus on touch devices
      if (!(
        'ontouchstart' in document.documentElement
        || navigator.maxTouchPoints > 0
      )) {
        inputRef.focus()
      }
    }
  }

  // -------------------------
  // 新しい夜
  // -------------------------

  const clear = async() => {
    inputRef.value = ''
    inputRef.style.height = 'auto'

    setMessageList([])
    setCurrentAssistantMessage('')
    setCurrentError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user)
        return

      const { error } = await supabase
        .from('messages')
        .delete()
        .eq('user_id', user.id)

      if (error)
        console.error('Failed to clear messages:', error)
    }
    catch (err) {
      console.error('Failed to clear messages:', err)
    }
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
        canEdit={() => messageList().length === 0}
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
