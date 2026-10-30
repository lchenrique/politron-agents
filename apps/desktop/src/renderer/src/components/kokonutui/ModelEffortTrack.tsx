import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface EffortLevel { id: string; label: string; hint?: string }

export function ModelEffortTrack({ levels, value, onChange, labelId }: {
  levels: EffortLevel[]
  value: number
  onChange: (index: number) => void
  labelId: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const count = levels.length
  const indexAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return value
    const share = (clientX - rect.left) / rect.width
    return Math.min(count - 1, Math.max(0, Math.floor(share * count)))
  }
  const onKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowLeft: value - 1, ArrowDown: value - 1, ArrowRight: value + 1, ArrowUp: value + 1,
      Home: 0, End: count - 1,
    }
    if (event.key in moves) {
      event.preventDefault()
      onChange(Math.min(count - 1, Math.max(0, moves[event.key])))
    }
  }
  return <div aria-labelledby={labelId} aria-valuemax={count - 1} aria-valuemin={0} aria-valuenow={value}
    aria-valuetext={levels[value]?.label} className="h-9 cursor-pointer touch-none select-none rounded-md bg-muted/75 p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onKeyDown={onKeyDown} onLostPointerCapture={() => setDragging(false)}
    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); onChange(indexAt(event.clientX)) }}
    onPointerMove={event => { if (dragging) { const next = indexAt(event.clientX); if (next !== value) onChange(next) } }}
    onPointerUp={() => setDragging(false)} role="slider" tabIndex={0}>
    <div className="relative flex h-full" ref={trackRef}>
      <span aria-hidden="true" className={cn(
        'absolute inset-y-0 rounded-[10px] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-black/5 transition-[left,width] duration-250 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none dark:bg-zinc-700 dark:ring-white/10',
        dragging && 'duration-150')}
        style={{ left: `${(value / count) * 100}%`, width: `${100 / count}%` }} />
      {levels.map((level, index) => <span aria-hidden="true" key={level.id}
        className={cn('relative flex min-w-0 flex-1 items-center justify-center whitespace-nowrap text-[11px] transition-colors duration-150',
          index === value ? 'font-medium text-zinc-900 dark:text-white' : 'text-zinc-500 dark:text-zinc-400')}>
        {level.label}
      </span>)}
    </div>
  </div>
}
