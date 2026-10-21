interface CurrentPlayer {
  id: string;
  name: string;
  handicap: number;
}

export function teamFromCurrentPlayers(
  teamName: string,
  player1Id: string,
  player2Id: string,
  players: CurrentPlayer[],
) {
  const player1 = players.find((player) => player.id === player1Id);
  const player2 = players.find((player) => player.id === player2Id);
  if (!player1 || !player2) throw new Error("Select two current players");
  if (player1.id === player2.id) throw new Error("Select two different players");
  if (!teamName.trim()) throw new Error("Team name is required");
  return {
    team_name: teamName.trim(),
    player1_name: player1.name,
    player2_name: player2.name,
    player1_handicap: Number(player1.handicap),
    player2_handicap: Number(player2.handicap),
  };
}