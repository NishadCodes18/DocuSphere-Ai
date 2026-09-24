import html
import json
import re
import urllib.parse
import urllib.request


def search_web_evidence(query: str, max_results: int = 3) -> list[dict]:
    """Retrieves online reference evidence from DuckDuckGo and Wikipedia

    to cross-verify and ground document findings with live web citations [W1], [W2].
    """
    results: list[dict] = []

    # 1. Query DuckDuckGo Lite for live web pages
    try:
        url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(query)
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        with urllib.request.urlopen(req, timeout=6) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
            # Parse snippets and titles using regex
            snippet_matches = re.findall(
                r'<a class="result__snippet[^>]*>(.*?)</a>', content, re.DOTALL
            )
            title_matches = re.findall(
                r'<h2 class="result__title">.*?<a class="result__url"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
                content,
                re.DOTALL,
            )

            for i in range(min(len(snippet_matches), max_results)):
                clean_snippet = html.unescape(
                    re.sub(r"<[^>]+>", "", snippet_matches[i]).strip()
                )
                if i < len(title_matches):
                    link = title_matches[i][0]
                    title = html.unescape(
                        re.sub(r"<[^>]+>", "", title_matches[i][1]).strip()
                    )
                else:
                    link = "https://duckduckgo.com/?q=" + urllib.parse.quote(query)
                    title = f"Web Reference {i+1}"

                if clean_snippet and len(clean_snippet) > 20:
                    results.append(
                        {
                            "id": f"W{len(results)+1}",
                            "title": title[:70],
                            "snippet": clean_snippet[:350],
                            "url": link,
                            "source_type": "web",
                        }
                    )
    except Exception as e:
        print(f"[DocuSphere AI] Web search DDG notice: {e}")

    # 2. Query Wikipedia API if we need more authoritative academic depth
    if len(results) < max_results:
        try:
            wiki_url = f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(query)}&utf8=&format=json"
            req = urllib.request.Request(
                wiki_url,
                headers={"User-Agent": "DocuSphereAI/2.0 (research assistant)"},
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                search_items = data.get("query", {}).get("search", [])
                for item in search_items:
                    clean_snip = html.unescape(
                        re.sub(r"<[^>]+>", "", item.get("snippet", "")).strip()
                    )
                    title = item.get("title", "Wikipedia")
                    page_id = item.get("pageid")
                    page_url = (
                        f"https://en.wikipedia.org/?curid={page_id}"
                        if page_id
                        else "https://en.wikipedia.org"
                    )
                    if clean_snip:
                        results.append(
                            {
                                "id": f"W{len(results)+1}",
                                "title": f"Wikipedia: {title}",
                                "snippet": clean_snip[:350],
                                "url": page_url,
                                "source_type": "academic_wiki",
                            }
                        )
                    if len(results) >= max_results:
                        break
        except Exception as e:
            print(f"[DocuSphere AI] Web search Wikipedia notice: {e}")

    return results
