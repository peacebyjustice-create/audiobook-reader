import { memo, type ReactNode } from 'react'
import { groupBySilence } from '../core/paragraphs'
import type { LoadedBook } from './openBook'

/**
 * 본문 렌더링. 강조·반복 표시는 Reader가 data-seg로 DOM 클래스만 바꿈(전체 다시 그리기 방지).
 * - 책 모드: 문장 span[data-seg][data-sent], 시각 없는 문장은 .dim. 오디오 전용 구간은 블록 뒤 .aud 줄
 * - 자막 보기: 문장 단위로 묶은 큐 span[data-seg], 무음 2초 이상에서 문단
 */
export const BookView = memo(function BookView({ loaded }: { loaded: LoadedBook }) {
  const { book, cues, timeline } = loaded
  if (!book) {
    const segs = timeline.segments
    return (
      <>
        {groupBySilence(segs).map(([a, b]) => (
          <p key={a}>
            {segs.slice(a, b).map((s, k) => (
              <span key={a + k} data-seg={a + k} className="s">
                {cues
                  .slice(s.cueStart, s.cueEnd)
                  .map((c) => c.text)
                  .join(' ')}{' '}
              </span>
            ))}
          </p>
        ))}
      </>
    )
  }

  // 오디오 전용 구간을 직전 문장의 블록 뒤에 둠
  const afterBlock = new Map<number, number[]>()
  const before: number[] = []
  let lastBlock = -1
  timeline.segments.forEach((s, i) => {
    if (s.sentence !== undefined) lastBlock = book.sentences[s.sentence].block
    else if (s.kind === 'audio') {
      if (lastBlock < 0) before.push(i)
      else afterBlock.set(lastBlock, [...(afterBlock.get(lastBlock) ?? []), i])
    }
  })
  const audioLine = (i: number) => {
    const s = timeline.segments[i]
    const text = cues
      .slice(s.cueStart, s.cueEnd)
      .map((c) => c.text)
      .join(' ')
    return (
      <div key={`a${i}`} className="aud" data-seg={i}>
        <span className="aud-label">오디오 전용</span> {text}
      </div>
    )
  }

  const out: ReactNode[] = before.map(audioLine)
  let si = 0
  book.blocks.forEach((b, bi) => {
    const children: ReactNode[] = []
    let pos = b.start
    for (; si < book.sentences.length && book.sentences[si].block === bi; si++) {
      const s = book.sentences[si]
      if (s.start > pos) children.push(book.text.slice(pos, s.start))
      const seg = timeline.sentenceSeg[si]
      children.push(
        <span key={si} data-seg={seg} data-sent={si} className={seg < 0 ? 's dim' : 's'}>
          {book.text.slice(s.start, s.end)}
        </span>,
      )
      pos = s.end
    }
    if (pos < b.end) children.push(book.text.slice(pos, b.end))
    if (b.kind === 'heading') {
      const Tag = (b.level <= 2 ? 'h2' : b.level <= 4 ? 'h3' : 'h4') as 'h2'
      out.push(
        <Tag key={bi} className="h">
          {children}
        </Tag>,
      )
    } else out.push(<p key={bi}>{children}</p>)
    for (const i of afterBlock.get(bi) ?? []) out.push(audioLine(i))
  })
  return <>{out}</>
})
