require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Curalink Backend API Running 🚀");
});

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

function expandQuery(message) {
  const lower = message.toLowerCase();

  if (lower.includes("treatment")) {
    return message + " latest treatment clinical trials";
  }

  if (lower.includes("symptoms")) {
    return message + " symptoms causes diagnosis";
  }

  if (lower.includes("vitamin")) {
    return message + " medical research study benefits risks";
  }

  return message + " medical research";
}

async function fetchPubMed(query) {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${query}&retmax=5&retmode=json`;

  const res = await axios.get(url);
  return res.data.esearchresult.idlist;
}

async function fetchOpenAlex(query) {
  const res = await axios.get(
    `https://api.openalex.org/works?search=${query}&per-page=5`
  );

  return res.data.results;
}

async function fetchTrials(query) {
  const res = await axios.get(
    `https://clinicaltrials.gov/api/v2/studies?query.cond=${query}&pageSize=5`
  );

  return res.data.studies;
}

async function fetchPubMedDetails(ids) {
  if (!ids.length) return [];

  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;

  // For now, we fetch but return structured placeholders as per the Step 1 requirement
  // (parsing XML can be added in Step 2)
  await axios.get(url);

  return ids.map(id => ({
    title: `PubMed Article ${id}`,
    url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    source: "PubMed"
  }));
}

function cleanOpenAlex(data) {
  return data.map(item => ({
    title: item.title,
    year: item.publication_year,
    source: "OpenAlex"
  }));
}

function cleanTrials(data) {
  return (data || []).map(trial => ({
    title: trial.protocolSection?.identificationModule?.briefTitle || trial.title,
    status: trial.protocolSection?.statusModule?.overallStatus || trial.status,
    source: "ClinicalTrials"
  }));
}

function rankPublications(publications, query) {
  return publications
    .map(item => {
      let score = 0;

      // ✅ Relevance check
      if (item.title && item.title.toLowerCase().includes(query.toLowerCase())) {
        score += 5;
      }

      // ✅ Recency
      if (item.year) {
        score += item.year > 2020 ? 3 : 1;
      }

      // ✅ Source weight
      if (item.source === "PubMed") score += 3;
      if (item.source === "OpenAlex") score += 2;

      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function rankTrials(trials, query) {
  return trials
    .map(item => {
      let score = 0;

      if (item.title?.toLowerCase().includes(query.toLowerCase())) {
        score += 5;
      }

      if (item.status === "Recruiting") {
        score += 3;
      }

      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

async function generateLLMResponse(query, publications, trials) {
  const prompt = `
You are a medical research assistant.

User Query:
${query}

Publications:
${publications.map(p => p.title).join("\n")}

Clinical Trials:
${trials.map(t => t.title).join("\n")}

IMPORTANT:
- Do not hallucinate
- Use only given data

Return response in this JSON format:

{
  "overview": "...",
  "research": ["point1", "point2"],
  "trials": ["point1", "point2"]
}
`;

  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set");
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash"
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return text;
  } catch (error) {
    console.error("Gemini Error:", error.message);
    return "AI synthesis currently unavailable.";
  }
}

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    const expandedQuery = expandQuery(message);

    const pubmedIds = await fetchPubMed(expandedQuery);
    const pubmed = await fetchPubMedDetails(pubmedIds);

    const openalexRaw = await fetchOpenAlex(expandedQuery);
    const openalex = cleanOpenAlex(openalexRaw);

    const trialsRaw = await fetchTrials(expandedQuery);
    const trials = cleanTrials(trialsRaw);

    const rankedPublications = rankPublications(
      [...pubmed, ...openalex],
      expandedQuery
    );

    console.log("Ranked Publications:", rankedPublications);

    const rankedTrials = rankTrials(trials, expandedQuery);

    const aiResponse = await generateLLMResponse(
      expandedQuery,
      rankedPublications,
      rankedTrials
    );

    let parsed;
    try {
      parsed = JSON.parse(aiResponse);
    } catch {
      parsed = {
        overview: aiResponse,
        research: [],
        trials: []
      };
    }

    res.json({
      reply: parsed,
      data: {
        publications: rankedPublications,
        trials: rankedTrials
      }
    });

  } catch (error) {
    console.error(error);
    res.json({ reply: "Error processing data. Check if Ollama is running." });
  }
});

// Render/production will provide PORT via environment; locally it defaults to 5000.
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running"));
