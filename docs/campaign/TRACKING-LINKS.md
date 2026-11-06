# Tracking links

One link per account and platform. The ref after the equals sign is the only thing that changes: it is `<platform>-<account>`, so a visit or check started from a link can be traced back to where it came from. Put the link in the profile bio (never as a loose URL in captions on TikTok or Instagram, where it is not clickable).

Base: `https://beta.savantedu.com/act-check?ref=<platform>-<account>`

| Account | Platform | Ref | Link |
|---|---|---|---|
| ACT study | TikTok | `tiktok-act` | https://beta.savantedu.com/act-check?ref=tiktok-act |
| ACT study | Instagram Reels | `instagram-act` | https://beta.savantedu.com/act-check?ref=instagram-act |
| ACT study | YouTube Shorts | `youtube-act` | https://beta.savantedu.com/act-check?ref=youtube-act |
| ACT study | X (Twitter) | `x-act` | https://beta.savantedu.com/act-check?ref=x-act |
| ACT study | Facebook Reels | `facebook-act` | https://beta.savantedu.com/act-check?ref=facebook-act |
| Brain / curiosity | TikTok | `tiktok-brain` | https://beta.savantedu.com/act-check?ref=tiktok-brain |
| Brain / curiosity | Instagram Reels | `instagram-brain` | https://beta.savantedu.com/act-check?ref=instagram-brain |
| Brain / curiosity | YouTube Shorts | `youtube-brain` | https://beta.savantedu.com/act-check?ref=youtube-brain |
| Brain / curiosity | X (Twitter) | `x-brain` | https://beta.savantedu.com/act-check?ref=x-brain |
| Brain / curiosity | Facebook Reels | `facebook-brain` | https://beta.savantedu.com/act-check?ref=facebook-brain |
| Savant | TikTok | `tiktok-savant` | https://beta.savantedu.com/act-check?ref=tiktok-savant |
| Savant | Instagram Reels | `instagram-savant` | https://beta.savantedu.com/act-check?ref=instagram-savant |
| Savant | YouTube Shorts | `youtube-savant` | https://beta.savantedu.com/act-check?ref=youtube-savant |
| Savant | X (Twitter) | `x-savant` | https://beta.savantedu.com/act-check?ref=x-savant |
| Savant | Facebook Reels | `facebook-savant` | https://beta.savantedu.com/act-check?ref=facebook-savant |
| Math tricks | TikTok | `tiktok-math` | https://beta.savantedu.com/act-check?ref=tiktok-math |
| Math tricks | Instagram Reels | `instagram-math` | https://beta.savantedu.com/act-check?ref=instagram-math |
| Math tricks | YouTube Shorts | `youtube-math` | https://beta.savantedu.com/act-check?ref=youtube-math |
| Math tricks | X (Twitter) | `x-math` | https://beta.savantedu.com/act-check?ref=x-math |
| Math tricks | Facebook Reels | `facebook-math` | https://beta.savantedu.com/act-check?ref=facebook-math |
| Study tips | TikTok | `tiktok-study` | https://beta.savantedu.com/act-check?ref=tiktok-study |
| Study tips | Instagram Reels | `instagram-study` | https://beta.savantedu.com/act-check?ref=instagram-study |
| Study tips | YouTube Shorts | `youtube-study` | https://beta.savantedu.com/act-check?ref=youtube-study |
| Study tips | X (Twitter) | `x-study` | https://beta.savantedu.com/act-check?ref=x-study |
| Study tips | Facebook Reels | `facebook-study` | https://beta.savantedu.com/act-check?ref=facebook-study |
| School (parents, not children) | TikTok | `tiktok-school` | https://beta.savantedu.com/act-check?ref=tiktok-school |
| School (parents, not children) | Instagram Reels | `instagram-school` | https://beta.savantedu.com/act-check?ref=instagram-school |
| School (parents, not children) | YouTube Shorts | `youtube-school` | https://beta.savantedu.com/act-check?ref=youtube-school |
| School (parents, not children) | X (Twitter) | `x-school` | https://beta.savantedu.com/act-check?ref=x-school |
| School (parents, not children) | Facebook Reels | `facebook-school` | https://beta.savantedu.com/act-check?ref=facebook-school |
| Building in public | TikTok | `tiktok-bip` | https://beta.savantedu.com/act-check?ref=tiktok-bip |
| Building in public | Instagram Reels | `instagram-bip` | https://beta.savantedu.com/act-check?ref=instagram-bip |
| Building in public | YouTube Shorts | `youtube-bip` | https://beta.savantedu.com/act-check?ref=youtube-bip |
| Building in public | X (Twitter) | `x-bip` | https://beta.savantedu.com/act-check?ref=x-bip |
| Building in public | Facebook Reels | `facebook-bip` | https://beta.savantedu.com/act-check?ref=facebook-bip |

The school account's link is for parents: the bio wording speaks to parents ("a free check of where your child is"), never to children, and no school video asks a child to apply or give personal details.

## Outreach links

For messages in OUTREACH.md use a ref per audience so replies can be told apart:

| Audience | Link |
|---|---|
| friends | https://beta.savantedu.com/act-check?ref=outreach-friends |
| counsellors | https://beta.savantedu.com/act-check?ref=outreach-counsellors |
| tutors | https://beta.savantedu.com/act-check?ref=outreach-tutors |
| clubs | https://beta.savantedu.com/act-check?ref=outreach-clubs |
| creators | https://beta.savantedu.com/act-check?ref=outreach-creators |

## Notes

- Add a new platform or account by following the same `<platform>-<account>` pattern; nothing else is needed.
- Check that the app records the ref before relying on these numbers (the check page is on beta; confirm after the orchestrator deploys).
