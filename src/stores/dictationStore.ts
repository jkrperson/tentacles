import { create } from 'zustand'
import { trpc } from '../trpc'
import { useSessionStore } from './sessionStore'
import type { DictationUsage } from '../types'

export type DictationPhase = 'idle' | 'recording' | 'processing'

interface DictationState {
  phase: DictationPhase
  rawTranscript: string
  /** Current unstable streaming partial — rendered alongside rawTranscript until finalized by AWS. */
  partialTranscript: string
  transcriptChunks: string[]
  cleanedText: string | null
  error: string | null
  usage: DictationUsage | null
  audioLevel: number  // 0–1 RMS level from mic

  toggle: () => void
  startRecording: () => void
  stopRecording: () => void
  finalizeAfterRecording: () => void
  appendTranscript: (text: string) => void
  setPartialTranscript: (text: string) => void
  runCleanup: () => Promise<void>
  insertIntoAgent: (text: string) => void
  setAudioLevel: (level: number) => void
  fetchUsage: () => Promise<void>
  cancel: () => void
}

export const useDictationStore = create<DictationState>((set, get) => ({
  phase: 'idle',
  rawTranscript: '',
  partialTranscript: '',
  transcriptChunks: [],
  cleanedText: null,
  error: null,
  usage: null,
  audioLevel: 0,

  toggle: () => {
    const { phase, stopRecording, startRecording } = get()
    console.log('[dictation-store] toggle, current phase:', phase)
    if (phase === 'recording') {
      stopRecording()
    } else if (phase === 'idle') {
      startRecording()
    }
  },

  startRecording: () => {
    console.log('[dictation-store] startRecording')
    set({ phase: 'recording', rawTranscript: '', partialTranscript: '', transcriptChunks: [], cleanedText: null, error: null })
  },

  stopRecording: () => {
    const { phase } = get()
    console.log('[dictation-store] stopRecording, phase:', phase)
    if (phase !== 'recording') return
    // Move to 'processing' so the useDictation hook finalizes the in-flight
    // audio chunk (stop recorder → transcribe final blob → appendTranscript),
    // then the hook calls finalizeAfterRecording() below to run cleanup.
    set({ phase: 'processing' })
  },

  finalizeAfterRecording: () => {
    const { rawTranscript, runCleanup } = get()
    console.log('[dictation-store] finalizeAfterRecording, transcript length:', rawTranscript.length)
    if (!rawTranscript.trim()) {
      console.log('[dictation-store] empty transcript after finalize, going idle')
      set({ phase: 'idle' })
      return
    }
    runCleanup()
  },

  appendTranscript: (text: string) => {
    console.log('[dictation-store] appendTranscript:', text)
    set((s) => ({
      rawTranscript: s.rawTranscript + (s.rawTranscript ? ' ' : '') + text,
      transcriptChunks: [...s.transcriptChunks, text],
    }))
  },

  setPartialTranscript: (text: string) => {
    set({ partialTranscript: text })
  },

  runCleanup: async () => {
    const { rawTranscript, transcriptChunks, insertIntoAgent } = get()
    try {
      const result = await trpc.dictation.cleanup.mutate({
        rawTranscript,
        chunks: transcriptChunks,
      })
      insertIntoAgent(result.cleanedText)
    } catch (err) {
      set({ phase: 'idle', error: err instanceof Error ? err.message : 'Cleanup failed' })
    }
  },

  insertIntoAgent: (text: string) => {
    const activeSessionId = useSessionStore.getState().activeSessionId
    if (activeSessionId) {
      trpc.session.write.mutate({ id: activeSessionId, data: text })
    }
    set({ phase: 'idle', cleanedText: text })
  },

  setAudioLevel: (level: number) => {
    set({ audioLevel: level })
  },

  fetchUsage: async () => {
    try {
      const usage = await trpc.dictation.usage.query()
      set({ usage })
    } catch {
      // Silently fail — usage display is optional
    }
  },

  cancel: () => {
    set({ phase: 'idle', rawTranscript: '', partialTranscript: '', transcriptChunks: [], cleanedText: null, error: null })
  },
}))
