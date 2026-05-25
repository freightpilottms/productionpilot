"use client";

import { useEffect } from "react";

export function useEqualHeights(selector = ".equalGroup", deps = []) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let frame = null;

    function apply() {
      const nodes = Array.from(document.querySelectorAll(selector));
      nodes.forEach((node) => {
        node.style.minHeight = "";
      });

      if (window.innerWidth < 1001 || nodes.length < 2) return;

      const rows = new Map();
      nodes.forEach((node) => {
        const top = Math.round(node.getBoundingClientRect().top);
        const row = rows.get(top) || [];
        row.push(node);
        rows.set(top, row);
      });

      rows.forEach((row) => {
        const max = Math.max(...row.map((node) => node.getBoundingClientRect().height));
        row.forEach((node) => {
          node.style.minHeight = `${Math.ceil(max)}px`;
        });
      });
    }

    function schedule() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(apply);
    }

    schedule();
    window.addEventListener("resize", schedule);

    const observer = "ResizeObserver" in window ? new ResizeObserver(schedule) : null;
    if (observer) {
      document.querySelectorAll(selector).forEach((node) => observer.observe(node));
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      document.querySelectorAll(selector).forEach((node) => {
        node.style.minHeight = "";
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
