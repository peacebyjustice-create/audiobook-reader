import type { ReactNode } from 'react'

/** 아래에서 올라오는 메뉴. 바깥을 누르면 닫힘 */
export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </div>
    </div>
  )
}
