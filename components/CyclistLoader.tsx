interface Props {
  message?: string;
}

export default function CyclistLoader({ message = "加载中..." }: Props) {
  return (
    <div className="mx-auto flex w-full flex-col items-center gap-3 bg-transparent py-2 text-center">
      <img
        src="/kawaii-cat.png?v=3"
        alt=""
        aria-hidden="true"
        className="tp-kawaii-cat h-24 w-24 object-contain"
      />

      <div className="relative h-2 w-36 overflow-hidden rounded-full bg-pink-100">
        <div className="tp-kawaii-bar absolute top-0 left-[-45%] h-full w-[45%] rounded-full bg-[linear-gradient(90deg,#f9a8d4,#fb7185,#fbcfe8)]" />
      </div>

      <div className="text-center text-xs text-slate-400">
        {message}
      </div>

      <style>{`
        .tp-kawaii-cat {
          animation: tp-kawaii-float 1.4s ease-in-out infinite;
        }

        .tp-kawaii-bar {
          animation: tp-kawaii-slide 1.8s linear infinite;
        }

        @keyframes tp-kawaii-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        @keyframes tp-kawaii-slide {
          from { transform: translateX(-100%); }
          to { transform: translateX(220%); }
        }
      `}</style>
    </div>
  );
}
