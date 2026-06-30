import styles from './AssetFrame.module.css'

interface Props {
  blob: string
}

export default function AssetFrame({ blob }: Props) {
  if (!blob) return null
  const src = `data:text/html;charset=utf-8,${encodeURIComponent(blob)}`
  return (
    <div className={styles.wrap}>
      <iframe
        src={src}
        sandbox="allow-scripts"
        className={styles.frame}
        title="Visual asset"
        scrolling="no"
      />
    </div>
  )
}
