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
