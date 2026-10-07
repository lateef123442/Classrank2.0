import React from "react";
import { render } from "@testing-library/react-native";
import StatCard from "../StatCard";

describe("StatCard", () => {
  it("renders the label and value", () => {
    const { getByText } = render(<StatCard label="Points" value={1280} />);
    expect(getByText("Points")).toBeTruthy();
    expect(getByText("1280")).toBeTruthy();
  });

  it("renders string values (e.g. streak with emoji)", () => {
    const { getByText } = render(<StatCard label="Streak" value="5 🔥" />);
    expect(getByText("5 🔥")).toBeTruthy();
  });
});
