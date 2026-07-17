/**
 * Transcript sidecar format shared between the Screendrop app (producer)
 * and the share page (consumer). Times are seconds on the exported
 * video's timeline.
 */

export interface TranscriptCue {
  start: number
  end: number
  text: string
}

export interface TranscriptWord {
  text: string
  start: number
  end: number
}

export interface Transcript {
  cues: Array<TranscriptCue>
  /** Word-level timing when available; powers karaoke highlighting. */
  words?: Array<TranscriptWord>
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/** Validates untrusted JSON into a Transcript, dropping malformed entries. */
export function parseTranscript(raw: unknown): Transcript | null {
  if (typeof raw !== "object" || raw === null) return null
  const candidate = raw as { cues?: unknown; words?: unknown }
  if (!Array.isArray(candidate.cues)) return null

  const cues = candidate.cues
    .filter(
      (cue): cue is TranscriptCue =>
        typeof cue === "object" &&
        cue !== null &&
        isFiniteNumber((cue as TranscriptCue).start) &&
        isFiniteNumber((cue as TranscriptCue).end) &&
        (cue as TranscriptCue).end > (cue as TranscriptCue).start &&
        typeof (cue as TranscriptCue).text === "string" &&
        (cue as TranscriptCue).text.length > 0,
    )
    .map((cue) => ({ start: cue.start, end: cue.end, text: cue.text }))
    .sort((a, b) => a.start - b.start)

  if (cues.length === 0) return null

  let words: Array<TranscriptWord> | undefined
  if (Array.isArray(candidate.words)) {
    words = candidate.words
      .filter(
        (word): word is TranscriptWord =>
          typeof word === "object" &&
          word !== null &&
          isFiniteNumber((word as TranscriptWord).start) &&
          isFiniteNumber((word as TranscriptWord).end) &&
          typeof (word as TranscriptWord).text === "string" &&
          (word as TranscriptWord).text.length > 0,
      )
      .map((word) => ({ text: word.text, start: word.start, end: word.end }))
      .sort((a, b) => a.start - b.start)
    if (words.length === 0) words = undefined
  }

  return { cues, words }
}

function vttTimestamp(seconds: number): string {
  const clamped = Math.max(0, seconds)
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const secs = Math.floor(clamped % 60)
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000)
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`
}

/** WebVTT document for the native <track> captions. */
export function transcriptToVtt(transcript: Transcript): string {
  const lines = ["WEBVTT", ""]
  for (const cue of transcript.cues) {
    lines.push(`${vttTimestamp(cue.start)} --> ${vttTimestamp(cue.end)}`)
    lines.push(cue.text)
    lines.push("")
  }
  return lines.join("\n")
}
