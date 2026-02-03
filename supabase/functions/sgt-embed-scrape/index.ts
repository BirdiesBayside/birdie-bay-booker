const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TourStanding {
  position: number;
  playerName: string;
  hcp: number | null;
  events: number;
  wins: number;
  top5: number;
  top10: number;
  points: number;
}

interface TournamentStanding {
  position: number;
  playerName: string;
  hcp: number | null;
  r1: string;
  r1Thru: string;
  r2: string;
  r2Thru: string;
  score: string;
  toPar: string;
  thru: string;
}

function parseTourStandings(html: string): TourStanding[] {
  const standings: TourStanding[] = [];
  
  // Normalize whitespace and quotes for easier regex matching
  const normalizedHtml = html.replace(/\s+/g, ' ');
  
  // Match player rows - using ['""] to handle both single and double quotes
  // Looking for: <tr class="player-row" data-player-name="PlayerName">
  const rowRegex = /<tr[^>]*class=['"]player-row['"][^>]*data-player-name=['"]([^'"]+)['"][^>]*>(.*?)<\/tr>/gi;
  let match;
  
  while ((match = rowRegex.exec(normalizedHtml)) !== null) {
    const playerName = match[1];
    const rowContent = match[2];
    
    // Extract all td cell text content
    const cellRegex = /<td[^>]*>(.*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch;
    
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      // Strip HTML tags and get text content
      const text = cellMatch[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      cells.push(text);
    }
    
    // Extract handicap from the player cell (small number after player name)
    // Looking for pattern like: three-quarter-font">5</div>
    const hcpMatch = rowContent.match(/three-quarter-font['"]?>\s*(\d+)\s*<\/div>/i);
    const hcp = hcpMatch ? parseInt(hcpMatch[1], 10) : null;
    
    if (cells.length >= 5) {
      const position = parseInt(cells[0], 10) || 0;
      
      // Extract numeric values from cells
      const numericValues: number[] = [];
      for (let i = 2; i < cells.length; i++) {
        const num = parseInt(cells[i], 10);
        if (!isNaN(num)) {
          numericValues.push(num);
        }
      }
      
      // numericValues should be: [events, wins, top5, top10, points]
      standings.push({
        position,
        playerName,
        hcp,
        events: numericValues[0] || 0,
        wins: numericValues[1] || 0,
        top5: numericValues[2] || 0,
        top10: numericValues[3] || 0,
        points: numericValues[4] || numericValues[numericValues.length - 1] || 0,
      });
    }
  }
  
  return standings;
}

function parseTournamentStandings(html: string): TournamentStanding[] {
  const standings: TournamentStanding[] = [];
  
  const normalizedHtml = html.replace(/\s+/g, ' ');
  
  // Tournament rows may or may not have class="player-row", but they all have data-player-name
  // Match: <tr data-player-name="PlayerName">...</tr>
  const rowRegex = /<tr[^>]*data-player-name=['"]([^'"]+)['"][^>]*>(.*?)<\/tr>/gi;
  let match;
  
  while ((match = rowRegex.exec(normalizedHtml)) !== null) {
    const playerName = match[1];
    const rowContent = match[2];
    
    // Extract position from first td
    const posMatch = rowContent.match(/<td[^>]*class=['"][^'"]*position[^'"]*['"][^>]*>(\d+)<\/td>/i);
    const position = posMatch ? parseInt(posMatch[1], 10) : 0;
    
    // Extract handicap from three-quarter-font div after player name
    const hcpMatch = rowContent.match(/<div[^>]*class=['"][^'"]*three-quarter-font[^'"]*['"][^>]*>(\d+)<\/div>/i);
    const hcp = hcpMatch ? parseInt(hcpMatch[1], 10) : null;
    
    // Extract round scores and total from td cells
    // Structure: position | player | rd1 | rd2 | total
    const roundRegex = /<td[^>]*class=['"][^'"]*round[^'"]*['"][^>]*>([^<]*(?:<span[^>]*>[^<]*<\/span>)?)<\/td>/gi;
    const rounds: { score: string; thru: string }[] = [];
    let roundMatch;
    
    while ((roundMatch = roundRegex.exec(rowContent)) !== null) {
      const content = roundMatch[1];
      // Extract score (e.g., "+3" or "-2" or "E")
      const scoreMatch = content.match(/([+-]?\d+|E)/);
      const score = scoreMatch ? scoreMatch[1] : '-';
      // Extract thru from span (e.g., "F" or "(12)")
      const thruMatch = content.match(/<span[^>]*>([^<]*)<\/span>/);
      const thru = thruMatch ? thruMatch[1].replace(/[()]/g, '').trim() : '';
      rounds.push({ score, thru });
    }
    
    // Extract total from td with class containing "total"
    const totalMatch = rowContent.match(/<td[^>]*class=['"][^'"]*total[^'"]*['"][^>]*>([+-]?\d+|E)<\/td>/i);
    const total = totalMatch ? totalMatch[1] : '-';
    
    // Determine thru status - check last round with content
    let thruStatus = 'F';
    for (let i = rounds.length - 1; i >= 0; i--) {
      if (rounds[i].thru) {
        thruStatus = rounds[i].thru;
        break;
      }
    }
    
    standings.push({
      position,
      playerName,
      hcp,
      r1: rounds[0]?.score || '-',
      r1Thru: rounds[0]?.thru || '',
      r2: rounds[1]?.score || '-', 
      r2Thru: rounds[1]?.thru || '',
      score: total,
      toPar: total,
      thru: thruStatus || 'F',
    });
  }
  
  return standings;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    let body: Record<string, unknown> | null = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        body = await req.json();
      } catch {
        body = null;
      }
    }

    const getParam = (key: string) => {
      const fromQuery = url.searchParams.get(key);
      if (fromQuery !== null) return fromQuery;
      const fromBody = body?.[key];
      if (typeof fromBody === "string" || typeof fromBody === "number") return String(fromBody);
      return null;
    };

    const type = getParam("type"); // "tour" or "tournament"
    const id = getParam("id"); // tour ID or tournament ID
    const scoreType = getParam("scoreType") || "net"; // "net" or "gross"
    
    console.log(`[SGT-EMBED-SCRAPE] Type: ${type}, ID: ${id}, Score Type: ${scoreType}`);

    if (!type || !id) {
      return new Response(
        JSON.stringify({ error: "type and id parameters are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Construct the SGT embed URL
    let embedUrl: string;
    if (type === "tour") {
      embedUrl = `https://simulatorgolftour.com/embed/tour/${id}/standings/${scoreType}?theme=dark`;
    } else if (type === "tournament") {
      embedUrl = `https://simulatorgolftour.com/embed/tournament/${id}/standings/${scoreType}?theme=dark`;
    } else {
      return new Response(
        JSON.stringify({ error: "type must be 'tour' or 'tournament'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SGT-EMBED-SCRAPE] Fetching: ${embedUrl}`);

    // Fetch the SGT embed page
    const response = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BirdiesApp/1.0)",
        "Accept": "text/html",
      },
    });

    if (!response.ok) {
      console.error(`[SGT-EMBED-SCRAPE] Failed to fetch: ${response.status}`);
      return new Response(
        JSON.stringify({ error: `Failed to fetch SGT data: ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = await response.text();
    console.log(`[SGT-EMBED-SCRAPE] Received ${html.length} bytes`);
    
    // Debug: Check if player-row class exists
    const hasPlayerRows = html.includes('player-row');
    const hasDataPlayerName = html.includes('data-player-name');
    console.log(`[SGT-EMBED-SCRAPE] Contains player-row: ${hasPlayerRows}, data-player-name: ${hasDataPlayerName}`);

    // Parse the HTML based on type
    let standings;
    if (type === "tour") {
      standings = parseTourStandings(html);
    } else {
      standings = parseTournamentStandings(html);
    }

    console.log(`[SGT-EMBED-SCRAPE] Parsed ${standings.length} standings`);

    return new Response(
      JSON.stringify({ 
        standings,
        fetchedAt: new Date().toISOString(),
        source: embedUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-EMBED-SCRAPE] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
