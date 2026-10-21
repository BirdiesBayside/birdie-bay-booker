import { describe, expect, test } from "bun:test";
import { teamFromCurrentPlayers } from "./local-comp-team";

describe("teams from current players", () => {
  const players = [
    { id: "first", name: "Current Player One", handicap: 12.5 },
    { id: "second", name: "Current Player Two", handicap: -2.1 },
  ];

  test("uses the selected current players and their existing handicaps", () => {
    expect(teamFromCurrentPlayers("New Team", "first", "second", players)).toEqual({
      team_name: "New Team",
      player1_name: "Current Player One",
      player2_name: "Current Player Two",
      player1_handicap: 12.5,
      player2_handicap: -2.1,
    });
  });

  test("rejects a player missing from the current roster", () => {
    expect(() => teamFromCurrentPlayers("New Team", "first", "missing", players)).toThrow("Select two current players");
  });

  test("requires two different players", () => {
    expect(() => teamFromCurrentPlayers("New Team", "first", "first", players)).toThrow("Select two different players");
  });
});