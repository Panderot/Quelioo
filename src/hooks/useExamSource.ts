import { useMemo, useRef, useState } from 'react'

import { ExtractUrlApiError, extractUrlText } from '../api/extractUrl'
import type { ExtractUrlErrorCode } from '../api/extractUrl'
import type { FileTabState, InputTab, UrlTabState } from '../components/InputCard'
import { extractTextFromFile, FileExtractionError } from '../lib/fileExtraction'
import type { FileErrorCode } from '../lib/fileExtraction'
import { countWords } from '../lib/textStats'

const EMPTY_FILE_STATE: FileTabState = { file: null, fileName: '', fileSizeBytes: 0, extractedText: '', wordCount: 0, truncated: false, isExtracting: false, error: null }
const EMPTY_URL_STATE: UrlTabState = { title: '', extractedText: '', wordCount: 0, truncated: false, isFetching: false, error: null, fetched: false }

interface SourceInitial {
  textValue?: string
  activeTab?: InputTab
  urlValue?: string
}

/** The source of an exam: pasted text, an uploaded file or a web page, with the same extraction Create uses. */
export function useExamSource(initial: SourceInitial = {}) {
  const [textValue, setTextValue] = useState(initial.textValue ?? '')
  const [activeTab, setActiveTab] = useState<InputTab>(initial.activeTab ?? 'text')
  const [urlValue, setUrlValue] = useState(initial.urlValue ?? '')
  const [fileState, setFileState] = useState<FileTabState>(EMPTY_FILE_STATE)
  const [urlState, setUrlState] = useState<UrlTabState>(EMPTY_URL_STATE)
  const [hasError, setHasError] = useState(false)
  const fileToken = useRef(0)
  const urlAbort = useRef<AbortController | null>(null)

  const textWords = useMemo(() => countWords(textValue), [textValue])
  const content = activeTab === 'text' ? textValue : activeTab === 'file' ? fileState.extractedText : urlState.extractedText
  const wordCount = activeTab === 'text' ? textWords : activeTab === 'file' ? fileState.wordCount : urlState.wordCount
  const truncated = activeTab === 'file' ? fileState.truncated : activeTab === 'url' ? urlState.truncated : false

  const selectFile = async (file: File) => {
    const token = ++fileToken.current
    setHasError(false)
    setFileState({ ...EMPTY_FILE_STATE, file, fileName: file.name, fileSizeBytes: file.size, isExtracting: true })
    try {
      const extracted = await extractTextFromFile(file)
      if (fileToken.current !== token) return
      setFileState({ file, fileName: file.name, fileSizeBytes: file.size, extractedText: extracted.text, wordCount: extracted.wordCount, truncated: extracted.truncated, isExtracting: false, error: null })
    } catch (error) {
      if (fileToken.current !== token) return
      const code: FileErrorCode = error instanceof FileExtractionError ? error.code : 'corrupt'
      setFileState({ ...EMPTY_FILE_STATE, file, fileName: file.name, fileSizeBytes: file.size, isExtracting: false, error: code })
    }
  }

  const fetchUrl = async () => {
    const url = urlValue.trim()
    if (!url) {
      setHasError(true)
      return
    }
    setHasError(false)
    urlAbort.current?.abort()
    const controller = new AbortController()
    urlAbort.current = controller
    setUrlState({ ...EMPTY_URL_STATE, isFetching: true })
    try {
      const extracted = await extractUrlText(url, controller.signal)
      setUrlState({ title: extracted.title, extractedText: extracted.text, wordCount: extracted.wordCount, truncated: extracted.truncated, isFetching: false, error: null, fetched: true })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      const code: ExtractUrlErrorCode = error instanceof ExtractUrlApiError ? error.code : 'network'
      setUrlState({ ...EMPTY_URL_STATE, isFetching: false, error: code })
    }
  }

  return {
    textValue,
    activeTab,
    urlValue,
    fileState,
    urlState,
    hasError,
    content,
    wordCount,
    truncated,
    setTab: (tab: InputTab) => {
      setActiveTab(tab)
      setHasError(false)
    },
    setText: (value: string) => {
      setTextValue(value)
      if (value.trim()) setHasError(false)
    },
    setUrl: (value: string) => {
      setUrlValue(value)
      if (value.trim()) setHasError(false)
      setUrlState((current) => (current.fetched || current.error ? EMPTY_URL_STATE : current))
    },
    selectFile,
    removeFile: () => {
      fileToken.current += 1
      setFileState(EMPTY_FILE_STATE)
    },
    fetchUrl,
    editFileAsText: () => {
      if (!fileState.extractedText) return
      setTextValue(fileState.extractedText)
      setActiveTab('text')
    },
    editUrlAsText: () => {
      if (!urlState.extractedText) return
      setTextValue(urlState.extractedText)
      setActiveTab('text')
    },
    clear: () => {
      if (activeTab === 'text') setTextValue('')
      if (activeTab === 'url') {
        setUrlValue('')
        setUrlState(EMPTY_URL_STATE)
      }
      if (activeTab === 'file') setFileState(EMPTY_FILE_STATE)
      setHasError(false)
    },
    markError: () => setHasError(true),
  }
}
