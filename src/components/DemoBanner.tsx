export default function DemoBanner({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-2.5 text-xs font-semibold text-amber-hover" data-print-hide>
      {message}
    </p>
  )
}
