import { useState, useCallback, useRef } from 'react'

interface UseDragOptions {
  axis: 'x' | 'y'
  initial: number
  min: number
  max: number
  invert?: boolean
}

export function useDrag({ axis, initial, min, max, invert = false }: UseDragOptions) {
  const [value, setValue] = useState(initial)
  const [isDragging, setIsDragging] = useState(false)
  const startPos = useRef(0)
  const startValue = useRef(0)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true)
    startPos.current = axis === 'x' ? e.clientX : e.clientY
    startValue.current = value

    const onMouseMove = (ev: MouseEvent) => {
      const current = axis === 'x' ? ev.clientX : ev.clientY
      const delta = current - startPos.current
      const adjusted = invert ? startValue.current - delta : startValue.current + delta
      setValue(Math.max(min, Math.min(max, adjusted)))
    }

    const onMouseUp = () => {
      setIsDragging(false)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }, [axis, value, min, max, invert])

  return { value, onMouseDown, isDragging }
}
