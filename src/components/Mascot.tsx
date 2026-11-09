import type { CSSProperties } from "react";

export type MascotMood = "idle" | "happy" | "sleep" | "worry";

export function Mascot({
  size = 40,
  mood = "idle",
  full = false,
  className = "",
}: {
  size?: number;
  mood?: MascotMood;
  full?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`mascot-slot ${className}`}
      data-avatar={full ? "full" : undefined}
      style={{ "--mascot-size": `${size}px` } as CSSProperties}
    >
      <span className="mascot-photo" data-mood={mood}>
        <span className="mascot-img" />
      </span>
    </span>
  );
}
