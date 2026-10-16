// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "./routes";

afterEach(cleanup);

describe("application route navigation", () => {
  it("navigates from home to the local hub", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("link", { name: "Local hub" }));

    expect(
      await screen.findByRole("heading", { name: "Choose your community" }),
    ).toBeTruthy();
  });

  it("shows a not-found state and a working route home", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/not-a-real-page"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "We couldn’t find that page" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("link", { name: "Return home" }));

    expect(
      await screen.findByRole("heading", {
        name: "Build a stronger community, together.",
      }),
    ).toBeTruthy();
  });
});
