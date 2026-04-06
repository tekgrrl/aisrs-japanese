import os
import requests
import sys
import json

# Environment setup
REPO = os.environ.get("REPO")
PR_NUMBER = os.environ.get("PR_NUMBER")
GH_TOKEN = os.environ.get("GH_TOKEN")
MODEL_PROVIDER = os.environ.get("MODEL_PROVIDER", "gemini")

# 1. Fetch the PR Diff
headers = {
    "Authorization": f"Bearer {GH_TOKEN}",
    "Accept": "application/vnd.github.v3.diff",
}
diff_url = f"https://api.github.com/repos/{REPO}/pulls/{PR_NUMBER}"
diff_response = requests.get(diff_url, headers=headers)
diff_response.raise_for_status()
pr_diff = diff_response.text

if not pr_diff.strip():
    print("Empty diff, exiting.")
    sys.exit(0)

# 2. The Pragmatic Principal Prompt
prompt = f"""You are a Pragmatic Principal Software Engineer reviewing a Pull Request. 
You care deeply about shipping reliable code, preventing security vulnerabilities, and maintaining clean architecture. 
However, you are not a pedantic auditor. You allow for stylistic leeway, you understand engineering trade-offs, and you optimize for team velocity.

Review Rules:
1. "APPROVE": The code is solid. It may have minor nits, but nothing that should block a merge.
2. "REQUEST_CHANGES": There is a genuine security vulnerability, a severe logic error, or a major architectural break. Never block a PR for style or minor optimizations.
3. "COMMENT": You just want to leave general feedback without formally approving or blocking.

You MUST respond in raw, valid JSON with no markdown wrapping. Use this exact schema:
{{
  "decision": "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  "summary": "A brief, pragmatic summary of the PR. No robotic pleasantries.",
  "inline_comments": [
    {{
      "path": "file/path/here.ext",
      "line": 42,
      "body": "Your specific feedback on this line."
    }}
  ]
}}

Note: For inline_comments, strictly use the new line numbers from the right side of the unified diff. If there are no specific inline comments needed, leave the array empty.

Review this diff:
{pr_diff}
"""

# 3. Generate Review Content
raw_ai_text = ""
if MODEL_PROVIDER == "gemini":
    from google import genai

    client = genai.Client()
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    raw_ai_text = response.text

elif MODEL_PROVIDER == "anthropic":
    import anthropic

    client = anthropic.Anthropic()
    response = client.messages.create(
        model="claude-3-7-sonnet-20250219",
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_ai_text = response.content[0].text

# 4. Parse AI Response
# Clean up potential markdown wrappers if the LLM disobeys the prompt
if raw_ai_text.startswith("```json"):
    raw_ai_text = (
        raw_ai_text.replace("```json\n", "").replace("```", "").strip()
    )

try:
    ai_review = json.loads(raw_ai_text)
    decision = ai_review.get("decision", "COMMENT")
    summary = ai_review.get("summary", "Automated AI Review summary.")
    inline_comments = ai_review.get("inline_comments", [])
except json.JSONDecodeError:
    decision = "COMMENT"
    summary = (
        f"Error: AI returned malformed response. Raw output:\n\n{raw_ai_text}"
    )
    inline_comments = []

# Format inline comments for GitHub API
github_comments = []
for c in inline_comments:
    if "path" in c and "line" in c and "body" in c:
        github_comments.append(
            {
                "path": c["path"],
                "line": int(c["line"]),
                "side": "RIGHT",
                "body": c["body"],
            }
        )

# 5. Post the Review
review_url = f"https://api.github.com/repos/){REPO}/pulls/{PR_NUMBER}/reviews"
post_headers = {
    "Authorization": f"Bearer {GH_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}

payload = {
    "body": f"### AI Review (Pragmatic)\n\n{summary}",
    "event": decision,
    "comments": github_comments,
}

# Attempt 1: Post with inline comments
response = requests.post(review_url, headers=post_headers, json=payload)

# If GitHub rejects the payload (usually due to hallucinated line numbers out of diff bounds)
if response.status_code == 422 and github_comments:
    print(
        "GitHub rejected inline comments (likely invalid line numbers). Falling back to summary only."
    )

    # Roll the inline comments into the main body so the feedback isn't lost
    fallback_body = (
        payload["body"]
        + "\n\n**Inline Feedback (Line numbers may be approximate):**\n"
    )
    for c in github_comments:
        fallback_body += f"- `{c['path']}` (Line {c['line']}): {c['body']}\n"

    payload["body"] = fallback_body
    payload["comments"] = []  # Clear the inline comments

    # Attempt 2: Post without inline comments
    response = requests.post(review_url, headers=post_headers, json=payload)

response.raise_for_status()
print(f"Review submitted successfully. Decision: {decision}")
