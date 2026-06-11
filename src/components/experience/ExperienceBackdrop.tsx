export function ExperienceBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -left-40 -top-48 h-[42rem] w-[42rem] animate-aurora rounded-full bg-tamm-teal/30 blur-[130px]" />
      <div className="absolute -right-48 top-10 h-[38rem] w-[38rem] animate-aurora-slow rounded-full bg-tamm-cyan/20 blur-[140px]" />
      <div className="absolute bottom-[-12rem] left-1/3 h-[34rem] w-[34rem] animate-aurora rounded-full bg-accent-strong/25 blur-[150px]" />
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--ink-900) / 0.04) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--ink-900) / 0.04) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(120% 80% at 50% 0%, #000 35%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(120% 80% at 50% 0%, #000 35%, transparent 80%)",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-tamm-cyan/60 to-transparent" />
    </div>
  );
}
