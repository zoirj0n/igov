import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { cleanup, fireEvent, render } from "@testing-library/react";
import React, { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  return (
    <div ref={ref}>
      <button type="button">first</button>
      <button type="button">last</button>
    </div>
  );
}

afterEach(cleanup);

describe("useFocusTrap", () => {
  it("focuses the first focusable on mount", () => {
    render(<Dialog onClose={() => {}} />);
    expect((document.activeElement as HTMLElement).textContent).toBe("first");
  });

  it("wraps Tab from last → first and Shift+Tab from first → last", () => {
    const { getByText } = render(<Dialog onClose={() => {}} />);
    (getByText("last") as HTMLElement).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect((document.activeElement as HTMLElement).textContent).toBe("first");
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect((document.activeElement as HTMLElement).textContent).toBe("last");
  });

  it("Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<Dialog onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
