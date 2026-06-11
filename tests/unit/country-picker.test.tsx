import { CountryPicker } from "@/components/experience/CountryPicker";
import { I18nProvider } from "@/lib/i18n/context";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

function setup() {
  const onClose = vi.fn();
  const onSelect = vi.fn();
  const utils = render(
    <I18nProvider>
      <CountryPicker onClose={onClose} onSelect={onSelect} />
    </I18nProvider>,
  );
  return { onClose, onSelect, ...utils };
}

describe("CountryPicker", () => {
  it("search narrows the grid and selecting returns the choice", () => {
    const { onSelect, getByPlaceholderText, getByRole, queryByRole } = setup();
    fireEvent.change(getByPlaceholderText(/search/i), { target: { value: "braz" } });
    expect(queryByRole("button", { name: /Germany/ })).toBeNull();
    fireEvent.click(getByRole("button", { name: /Brazil/ }));
    expect(onSelect).toHaveBeenCalledWith({
      iso3: "BRA",
      name: "Brazil",
      flag: expect.any(String),
    });
  });

  it("region chips filter — Europe hides Brazil, shows Germany", () => {
    const { getByRole, queryByRole } = setup();
    fireEvent.click(getByRole("button", { name: /Europe/ }));
    expect(queryByRole("button", { name: /Brazil/ })).toBeNull();
    expect(getByRole("button", { name: /Germany/ })).toBeTruthy();
  });

  it("Escape closes via the focus trap", () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
