export function LoadingScreen({ message = 'Sedang memuatkan...' }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F8FAFC]">
      <div className="relative w-14 h-14">
        <div className="absolute inset-0 rounded-full border-4 border-[#EFF6FF]"></div>
        <div className="absolute inset-0 rounded-full border-4 border-[#2563EB] border-t-transparent animate-spin"></div>
      </div>
      <p className="text-sm text-[#0F172A]/50">{message}</p>
    </div>
  );
}

export function ErrorScreen({ message }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#F8FAFC] px-4 text-center">
      <span className="text-3xl">⚠️</span>
      <p className="text-sm text-[#F97362] max-w-xs">{message}</p>
    </div>
  );
}