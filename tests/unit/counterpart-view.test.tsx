import { CounterpartView } from "@/components/experience/CounterpartView";
import { I18nProvider } from "@/lib/i18n/context";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FIXTURE_STATE } from "../fixtures/agent-state";

afterEach(cleanup);

function show(profile: Parameters<typeof CounterpartView>[0]["profile"]) {
  return render(
    <I18nProvider>
      <CounterpartView profile={profile} />
    </I18nProvider>,
  );
}

describe("CounterpartView", () => {
  it("renders the confirmed dossier", () => {
    const { getByText } = show(FIXTURE_STATE.counterpart);
    expect(getByText("Alexandre Silveira")).toBeTruthy();
    expect(getByText(/Government of Brazil/)).toBeTruthy();
    expect(getByText(/Biofuels & SAF partnerships/)).toBeTruthy();
    expect(getByText(/Milton Campos Faculty of Law/)).toBeTruthy();
    expect(getByText(/wikipedia.org/)).toBeTruthy();
  });
  it("renders the unconfirmed state with the warning", () => {
    const { getByText } = show({
      ...FIXTURE_STATE.counterpart!,
      name: "",
      confidence: "unconfirmed",
    });
    expect(getByText(/Counterpart unconfirmed/)).toBeTruthy();
    expect(getByText(/verify the counterpart before the meeting/)).toBeTruthy();
  });
  it("treats a missing profile as unconfirmed", () => {
    const { getByText } = show(undefined);
    expect(getByText(/Counterpart unconfirmed/)).toBeTruthy();
  });
});
