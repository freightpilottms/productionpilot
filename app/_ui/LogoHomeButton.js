"use client";

import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { announcePrijemNavigationBlocked, shouldBlockPrijemNavigation } from "@/app/_ui/prijemProcessingGuard";

export default function LogoHomeButton({
  slotClassName = "",
  imageClassName = "",
  width = 180,
  height = 120,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pressed, setPressed] = useState(false);
  const timerRef = useRef(null);
  const releaseTimerRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current);
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
  }, []);

  function handleLogoClick() {
    if (shouldBlockPrijemNavigation("/home")) {
      announcePrijemNavigationBlocked();
      return;
    }

    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current);
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);

    setPressed(false);
    frameRef.current = window.requestAnimationFrame(() => {
      setPressed(true);
    });

    timerRef.current = window.setTimeout(() => {
      if (pathname !== "/home") router.push("/home");
    }, 280);

    releaseTimerRef.current = window.setTimeout(() => {
      setPressed(false);
    }, 460);
  }

  return (
    <div className={slotClassName}>
      <button
        className={`logoHomeButton clickable ${pressed ? "logoHomeButtonPop" : ""}`.trim()}
        type="button"
        onClick={handleLogoClick}
        aria-label="Idi na home"
        title="Home"
      >
        <Image
          src="/raj-logo.png"
          alt="RAJ App"
          width={width}
          height={height}
          className={`logoImg ${imageClassName}`.trim()}
          priority
          unoptimized
        />
      </button>
    </div>
  );
}
