import * as cheerio from "cheerio";

const createEventObjects = async () => {
  const pageURLs = [
    new URL("https://www.ufc.com/events?page=0"),
    new URL("https://www.ufc.com/events?page=1"),
  ];
  // Get individual event URLs from first two pages of website
  const eventURLs = await getEventURLs(pageURLs);

  // For each event, create object and push to array
  const eventObjArr = [];
  const mapPromise = eventURLs.map(async (url) => {
    const html = await extractHTML(url);
    const event = getEventDetails(html, url);
    eventObjArr.push(event);
  });
  await Promise.all(mapPromise);
  return eventObjArr;
};

const getEventURLs = async (urls) => {
  const eventObjArr = [];
  const mapPromise = urls.map(async (url) => {
    try {
      const html = await extractHTML(url);
      const $ = cheerio.load(html);
      const eventElements = $("h3.c-card-event--result__headline")
        .find("a")
        .toArray();
      if (eventElements.length > 0) {
        eventElements.forEach((elem) => {
          eventObjArr.push(new URL(`https://www.ufc.com${elem.attribs.href}`));
        });
      }
    } catch (err) {
      console.error(
        `Error getting event URLs for: ${url}\nError message: ${err.message}`
      );
    }
  });

  await Promise.all(mapPromise);
  eventObjArr.length === 0 && console.log("No event URLs found.");
  return eventObjArr;
};

const getEventDetails = (html, url) => {
  try {
    const $ = cheerio.load(html);
    let main = {},
      prelims = {},
      earlyPrelims = {};

    const headlinePrefix =
      // i.e., UFC Fight Night or UFC 300
      $(".field--name-node-title").find("h1").first()?.text().trim() || "TBD";
    const headlineFight =
      `${$("span.e-divider__top").text().trim()} vs. ${$(
        "span.e-divider__bottom"
      )
        ?.text()
        .trim()}` || "TBD vs. TBD";
    const headline = `${headlinePrefix}: ${headlineFight}`;

    const location =
      `${$("div.field--name-venue")
        .first()
        ?.text()
        .replace(/\s{2,}/gm, "")}`.replace(/,/g, ", ") || "";

    const mainUnix = $("div.c-hero__headline-suffix")?.attr("data-timestamp");
    main.time = unixToUTC(mainUnix);

    const prelimsTimestamp = $(
      "#prelims-card .c-event-fight-card-broadcaster__time"
    )?.attr("data-timestamp");
    if (prelimsTimestamp) prelims.time = unixToUTC(prelimsTimestamp);

    const earlyPrelimsTimestamp = $(
      "#early-prelims .c-event-fight-card-broadcaster__time"
    )?.attr("data-timestamp");
    if (earlyPrelimsTimestamp)
      earlyPrelims.time = unixToUTC(earlyPrelimsTimestamp);

    let startTime;
    if (earlyPrelims.time) {
      startTime = earlyPrelims.time;
    } else if (prelims.time) {
      startTime = prelims.time;
    } else if (main.time) {
      startTime = main.time;
    }
    const endTime = unixToUTC(parseInt(mainUnix) + 10800); // Assume event ends three hours after main card starts
    if (!startTime || !endTime)
      throw new Error(`start and/or end time from ${url}`);

    if (main.time) formatFightNotes($, "#main-card", main);
    if (prelims.time) formatFightNotes($, "#prelims-card", prelims);
    if (earlyPrelims.time) formatFightNotes($, "#early-prelims", earlyPrelims);

    return {
      headline,
      location,
      startTime,
      endTime,
      main,
      prelims,
      earlyPrelims,
      url,
    };
  } catch (err) {
    console.error(`Error getting event details: ${err.message}`);
  }
};

const formatFightNotes = ($, cardType, notesObj) => {
  try {
    const weightClasses = new Map([
      ["Strawweight", "115"],
      ["Flyweight", "125"],
      ["Bantamweight", "135"],
      ["Featherweight", "145"],
      ["Lightweight", "155"],
      ["Welterweight", "170"],
      ["Middleweight", "185"],
      ["Light Heavyweight", "205"],
      ["Heavyweight", "265"],
      ["Catchweight", "CW"],
    ]);

    const winMethods = new Map([
      ["Could Not Continue", ""],
      ["Submission", "SUB"],
      ["Decision - Unanimous", "DEC"],
      ["Decision - Split", "DEC"],
      ["KO/TKO", "T/KO"],
    ]);

    let fightNotes = "";
    const $cardFights = $(`${cardType} div.c-listing-fight__content`);
    $cardFights.each((index, fight) => {
      const getNames = (cornerClass) => {
        const nameArr = $(fight)
          .find(cornerClass)
          ?.text()
          .replace(/\s{2,}/gm, " ")
          .trim()
          .split(" ");
        if (nameArr.length === 1) return nameArr[0];
        return nameArr.slice(1).join(" ");
      };
      const redName = getNames("div.c-listing-fight__corner-name--red");
      const blueName = getNames("div.c-listing-fight__corner-name--blue");

      const results = { redWin: false, blueWin: false, draw: false, nc: false };
      const redResultText =
        $(fight).find("div.c-listing-fight__corner-body--red")?.text().trim() ||
        "";
      const blueResultText =
        $(fight)
          .find("div.c-listing-fight__corner-body--blue")
          ?.text()
          .trim() || "";
      if (redResultText === "Draw") results.draw = true;
      if (redResultText === "NC") results.nc = true;
      if (redResultText === "Win") results.redWin = true;
      if (blueResultText === "Win") results.blueWin = true;

      const winMethod =
        winMethods.get(
          $(fight)
            .find("div.c-listing-fight__result-text.method")
            .first()
            ?.text()
        ) || null;

      let fighterRanks = $(fight)
        .find("div.c-listing-fight__ranks-row")
        ?.text()
        .trim()
        .replace(/\s+/g, "")
        .split("#");
      fighterRanks = fighterRanks.filter((item) => item !== "");

      let fighterOdds =
        $(fight)
          .find("div.c-listing-fight__odds-wrapper")
          ?.text()
          .replace(/\s+/g, "")
          .split("odds") || [];

      let fightWeight = undefined;
      let fightWeightArr =
        $(fight)
          .find("div.c-listing-fight__class-text")
          .eq(0)
          ?.text()
          .trim()
          .split(" ") || [];
      fightWeightArr = fightWeightArr.filter(
        (item) => item !== "Title" && item !== "Women's"
      );
      fightWeightArr.length === 2
        ? (fightWeight = weightClasses.get(fightWeightArr[0]) || "N/A") // i.e., Middleweight Bout
        : (fightWeight =
            weightClasses.get(`${fightWeightArr[0]} ${fightWeightArr[1]}`) ||
            "N/A"); // i.e., Light Heavyweight Bout

      if (fighterRanks[0] !== undefined && fighterRanks[0] !== "C")
        fighterRanks[0] = `#${fighterRanks[0]}`;
      if (fighterRanks[1] !== undefined && fighterRanks[1] !== "C")
        fighterRanks[1] = `#${fighterRanks[1]}`;

      fightNotes += `➡️  ${results.nc ? " 🙅🏻‍♂️ " : ""}${
        results.draw ? " ✍🏻 " : ""
      }${fighterRanks[0] ? `(${fighterRanks[0]}) ` : ""}${redName}${
        fighterOdds[0] !== "-" ? ` (${fighterOdds[0]})` : ""
      }${results.redWin ? ` 🏆 ${winMethod && `by ${winMethod}`}` : ""} vs ${
        fighterRanks[1] ? `(${fighterRanks[1]}) ` : ""
      }${blueName}${fighterOdds[1] !== "-" ? ` (${fighterOdds[1]})` : ""}${
        results.blueWin ? ` 🏆 ${winMethod && `by ${winMethod}`}` : ""
      } @ ${fightWeight}${index !== $cardFights.length - 1 ? `\n` : ""}`;

      if (cardType === "#main-card" && notesObj.time) {
        notesObj.notes = `Main:\n${fightNotes}\n\n`;
      } else if (cardType === "#prelims-card" && notesObj.time) {
        notesObj.notes = `Prelims:\n${fightNotes}\n\n`;
      } else if (cardType === "#early-prelims" && notesObj.time) {
        notesObj.notes = `Early Prelims:\n${fightNotes}\n\n`;
      }
    });
  } catch (err) {
    console.error(`Error formatting notes ${err}`);
  }
};

const extractHTML = async (url) => {
  const res = await fetch(url);
  const html = await res.text();
  return html;
};

const unixToUTC = (unix) => {
  const date = new Date(unix * 1000);
  const formattedDate =
    date.getUTCFullYear() +
    ("0" + (date.getUTCMonth() + 1)).slice(-2) + // Month is zero-indexed
    ("0" + date.getUTCDate()).slice(-2) +
    "T" +
    ("0" + date.getUTCHours()).slice(-2) +
    ("0" + date.getUTCMinutes()).slice(-2) +
    ("0" + date.getUTCSeconds()).slice(-2) +
    "Z";
  return formattedDate;
};

export { createEventObjects };
