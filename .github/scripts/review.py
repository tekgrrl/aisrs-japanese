import os
import requests
import sys

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

prompt = f"""You are a strict, senior security auditor and code reviewer. 
Do not summarize the code, do not explain what the code does, and do not provide pleasantries. 
Your only goal is to aggressively identify security vulnerabilities, logic flaws, and performance bottlenecks.
If you find issues, detail exactly why they are a problem and how they could be exploited. 
If the code is genuinely flawless, state only 'No issues found.'

Review this diff:
{pr_diff}
"""
review_body = "### Automated AI Review\n\n"

# 2. Generate Review Content
if MODEL_PROVIDER == "gemini":
    from google import genai

    client = genai.Client()  # Uses GEMINI_API_KEY from environment
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    review_body += response.text

elif MODEL_PROVIDER == "anthropic":
    import anthropic

    client = anthropic.Anthropic()  # Uses ANTHROPIC_API_KEY from environment
    response = client.messages.create(
        model="claude-3-7-sonnet-20250219",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    review_body += response.content[0].text

# 3. Post the Approving Review
review_url = f"https://api.github.com/repos/{REPO}/pulls/{PR_NUMBER}/reviews"
post_headers = {
    "Authorization": f"Bearer {GH_TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
}
payload = {"body": review_body, "event": "APPROVE"}

post_response = requests.post(review_url, headers=post_headers, json=payload)
post_response.raise_for_status()

print("Review submitted successfully.")
