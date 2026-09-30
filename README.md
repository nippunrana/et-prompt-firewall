# ET Prompt Firewall

A prompt injection firewall that sits in front of an AI agent. It detects, localises and neutralises malicious instructions hidden in incoming content before they can influence the agent.

Built for the ET AI Hackathon: Agentic Edition.

**Status:** in development.

## Credits

- **Built with Llama.** The firewall uses [Llama Prompt Guard 2 86M](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M) by Meta, under the Llama 4 Community License.
- [PIGuard](https://huggingface.co/leolee99/PIGuard) (MIT), from *PIGuard: Prompt Injection Guardrail via Mitigating Overdefense for Free* (Li et al., ACL 2025).
- OCR by [RapidOCR](https://github.com/RapidAI/RapidOCR) and [RapidTable](https://github.com/RapidAI/RapidTable).
