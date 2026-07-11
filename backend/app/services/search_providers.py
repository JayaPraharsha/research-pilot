import asyncio
import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from difflib import SequenceMatcher

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

ATOM_NS = "{http://www.w3.org/2005/Atom}"


@dataclass
class NormalizedResult:
    title: str
    authors: list[str]
    year: int | None
    venue: str | None
    abstract: str | None
    doi: str | None
    url: str | None
    pdfUrl: str | None
    citationCount: int | None
    source: str


async def search_semantic_scholar(query: str, limit: int) -> list[NormalizedResult]:
    fields = "title,authors,year,venue,abstract,externalIds,citationCount,openAccessPdf,url"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.semanticscholar.org/graph/v1/paper/search",
                params={"query": query, "limit": limit, "fields": fields},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError:
        logger.warning("Semantic Scholar search failed", exc_info=True)
        return []

    results = []
    for item in data.get("data", []):
        oa_pdf = item.get("openAccessPdf") or {}
        results.append(
            NormalizedResult(
                title=item.get("title") or "Untitled",
                authors=[a.get("name", "") for a in item.get("authors", []) if a.get("name")],
                year=item.get("year"),
                venue=item.get("venue") or None,
                abstract=item.get("abstract"),
                doi=(item.get("externalIds") or {}).get("DOI"),
                url=item.get("url"),
                pdfUrl=oa_pdf.get("url"),
                citationCount=item.get("citationCount"),
                source="semantic_scholar",
            )
        )
    return results


def _arxiv_pdf_url(entry_id: str) -> str:
    return entry_id.replace("/abs/", "/pdf/")


async def search_arxiv(query: str, limit: int) -> list[NormalizedResult]:
    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(
                "https://export.arxiv.org/api/query",
                params={"search_query": f"all:{query}", "max_results": limit},
            )
            resp.raise_for_status()
            xml_text = resp.text
    except httpx.HTTPError:
        logger.warning("arXiv search failed", exc_info=True)
        return []

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        logger.warning("Failed to parse arXiv Atom response", exc_info=True)
        return []

    results = []
    for entry in root.findall(f"{ATOM_NS}entry"):
        entry_id = (entry.findtext(f"{ATOM_NS}id") or "").strip()
        title = (entry.findtext(f"{ATOM_NS}title") or "Untitled").strip().replace("\n", " ")
        summary = (entry.findtext(f"{ATOM_NS}summary") or "").strip().replace("\n", " ")
        published = entry.findtext(f"{ATOM_NS}published") or ""
        year = int(published[:4]) if published[:4].isdigit() else None
        authors = [
            (author.findtext(f"{ATOM_NS}name") or "").strip()
            for author in entry.findall(f"{ATOM_NS}author")
        ]
        results.append(
            NormalizedResult(
                title=title,
                authors=[a for a in authors if a],
                year=year,
                venue="arXiv",
                abstract=summary or None,
                doi=None,
                url=entry_id or None,
                pdfUrl=_arxiv_pdf_url(entry_id) if entry_id else None,
                citationCount=None,
                source="arxiv",
            )
        )
    return results


def _titles_match(a: str, b: str) -> bool:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio() > 0.9


def dedupe_and_rank(*result_lists: list[NormalizedResult]) -> list[NormalizedResult]:
    """Combine results from multiple providers, preserving relative order, and drop
    duplicates (matched by DOI or fuzzy title similarity).
    """
    combined: list[NormalizedResult] = []
    for results in result_lists:
        for candidate in results:
            is_duplicate = False
            for existing in combined:
                if candidate.doi and existing.doi and candidate.doi == existing.doi:
                    is_duplicate = True
                    break
                if _titles_match(candidate.title, existing.title):
                    is_duplicate = True
                    break
            if not is_duplicate:
                combined.append(candidate)
    return combined[: settings.search_result_limit]


async def run_search(query: str, limit: int | None = None) -> list[NormalizedResult]:
    limit = limit or settings.search_result_limit
    semantic_scholar_results, arxiv_results = [], []
    try:
        semantic_scholar_results, arxiv_results = await asyncio.gather(
            search_semantic_scholar(query, limit), search_arxiv(query, limit)
        )
    except Exception:
        logger.exception("Search provider fan-out failed")
    return dedupe_and_rank(semantic_scholar_results, arxiv_results)
