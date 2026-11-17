const paths = { left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7', down: 'M5 9l7 7 7-7' }

export default function Chevron({ dir }: { dir: keyof typeof paths }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 ${dir === 'left' ? '-ml-1' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[dir]} />
    </svg>
  )
}
