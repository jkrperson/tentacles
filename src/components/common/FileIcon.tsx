import { memo, useMemo } from 'react'
import { getFileIconName, getFolderIconName, getIconUrl } from '../../lib/fileIcons'

interface FileIconProps {
  name: string
  isDirectory?: boolean
  isExpanded?: boolean
  size?: number
  className?: string
}

export const FileIcon = memo(function FileIcon({ name, isDirectory, isExpanded, size = 13, className }: FileIconProps) {
  const iconName = useMemo(() => {
    if (isDirectory) return getFolderIconName(name, isExpanded ?? false)
    return getFileIconName(name)
  }, [name, isDirectory, isExpanded])

  return (
    <img
      src={getIconUrl(iconName)}
      width={size}
      height={size}
      alt=""
      className={`flex-shrink-0 ${className ?? ''}`}
      draggable={false}
    />
  )
})
