/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import Header from "../Header";

describe("Header", () => {
  it("renders the header with navigation links", () => {
    render(<Header />);

    const heading = screen.getByRole("link", { name: /aisrs/i });
    expect(heading).toBeInTheDocument();

    const manageLink = screen.getByRole("link", { name: /manage/i });
    expect(manageLink).toBeInTheDocument();

    const reviewLink = screen.getByRole("link", { name: /review/i });
    expect(reviewLink).toBeInTheDocument();
  });
});
