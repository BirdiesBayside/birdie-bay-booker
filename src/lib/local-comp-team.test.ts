import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { teamFromCurrentPlayers } from "./local-comp-team";

describe("teams from current players", () => {
  const players = [
    { id: "first", name: "Current Player One", handicap: 12.5 },
    { id: "second", name: "Current Player Two", handicap: -2.1 },
  ];

  test("uses the selected current players and their existing handicaps", () => {
    assert.deepEqual(teamFromCurrentPlayers("New Team", "first", "second", players), {
      team_name: "New Team",
      player1_name: "Current Player One",
      player2_name: "Current Player Two",
      player1_handicap: 12.5,
      player2_handicap: -2.1,
    });
  });

  test("rejects a player missing from the current roster", () => {
    assert.throws(() => teamFromCurrentPlayers("New Team", "first", "missing", players), /Select two current players/);
  });

  test("requires two different players", () => {
    assert.throws(() => teamFromCurrentPlayers("New Team", "first", "first", players), /Select two different players/);
  });
});