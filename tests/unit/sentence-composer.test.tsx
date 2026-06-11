import { SentenceComposer } from "@/components/experience/SentenceComposer";
import { I18nProvider } from "@/lib/i18n/context";
import { cleanup, fireEvent, render } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const BRA = { iso3: "BRA", name: "Brazil", flag: "🇧🇷" };

function setup(country: typeof BRA | null) {
  const onOpenPicker = vi.fn();
  const onRole = vi.fn();
  const onBegin = vi.fn();
  const utils = render(
    <I18nProvider>
      <SentenceComposer
        country={country}
        role={{ key: "energy" }}
        busy={false}
        onOpenPicker={onOpenPicker}
        onRole={onRole}
        onBegin={onBegin}
      />
    </I18nProvider>,
  );
  return { onOpenPicker, onRole, onBegin, ...utils };
}

describe("SentenceComposer", () => {
  it("opens the picker from the country slot and disables Begin without a country", () => {
    const { onOpenPicker, onBegin, getByRole } = setup(null);
    fireEvent.click(getByRole("button", { name: /select country/i }));
    expect(onOpenPicker).toHaveBeenCalledTimes(1);
    const begin = getByRole("button", { name: /begin briefing/i }) as HTMLButtonElement;
    expect(begin.disabled).toBe(true);
    fireEvent.click(begin);
    expect(onBegin).not.toHaveBeenCalled();
  });

  it("shows the chosen country, changes role, and begins", () => {
    const { onRole, onBegin, getByRole, getByText } = setup(BRA);
    expect(getByText(/Brazil/)).toBeTruthy();
    fireEvent.change(getByRole("combobox"), { target: { value: "trade" } });
    expect(onRole).toHaveBeenCalledWith({ key: "trade", customName: undefined });
    const begin = getByRole("button", { name: /begin briefing/i }) as HTMLButtonElement;
    expect(begin.disabled).toBe(false);
    fireEvent.click(begin);
    expect(onBegin).toHaveBeenCalledTimes(1);
  });

  it("shows the custom-name input only for the custom role", () => {
    const { queryByPlaceholderText, rerender } = setup(BRA);
    expect(queryByPlaceholderText(/name or title/i)).toBeNull();
    rerender(
      <I18nProvider>
        <SentenceComposer
          country={BRA}
          role={{ key: "custom", customName: "" }}
          busy={false}
          onOpenPicker={() => {}}
          onRole={() => {}}
          onBegin={() => {}}
        />
      </I18nProvider>,
    );
    expect(queryByPlaceholderText(/name or title/i)).not.toBeNull();
  });
});
