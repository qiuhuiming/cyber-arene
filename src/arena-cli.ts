import {
  createAgentsFromRoster,
  createOpenAICompatibleRequester,
  formatSystemProposition,
  runArenaRound,
  type Message,
} from "./chat/chat-core";
import {
  getProvider,
  loadArenaConfig,
  pickDefaultProviderKey,
} from "./config/arena-config";
import {
  getRoster,
  pickDefaultRosterKey,
} from "./config/arena-config";

function getFlagValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function printHelp() {
  console.log(
    [
      "Usage:",
      "  bun run src/arena-cli.ts --proposition \"...\"",
      "",
      "Options:",
      "  --provider <key>       Provider key (from arena-config.yaml)",
      "  --roster <key>         Roster key (from arena-config.yaml)",
      "  --proposition <text>   Debate topic (required unless --interactive)",
      "  --rounds <n>           Default 1",
      "  --maxAgents <n>        Default 5",
      "  --temperature <n>      Default 0.7",
      "  --model <name>         Defaults to provider's first model",
      "  --stream               Enable streaming",
    ].join("\n"),
  );
}

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const proposition = getFlagValue("--proposition") ?? "";
if (!proposition.trim()) {
  console.error("Missing --proposition.");
  printHelp();
  process.exit(1);
}

const config = loadArenaConfig();
const providerKey = getFlagValue("--provider") ?? pickDefaultProviderKey(config);
const provider = getProvider(config, providerKey);

const model = getFlagValue("--model") ?? provider.models[0] ?? "";
if (!model.trim()) {
  console.error(`Provider '${providerKey}' has no models.`);
  process.exit(1);
}

const temperature = Number(getFlagValue("--temperature") ?? "0.7");
const maxAgents = Number(getFlagValue("--maxAgents") ?? "5");
const rounds = Number(getFlagValue("--rounds") ?? "1");
const streaming = hasFlag("--stream");

const rosterKey = getFlagValue("--roster") ?? pickDefaultRosterKey(config);
const roster = getRoster(config, rosterKey);

let messages: Message[] = [
  {
    id: "m0",
    agentId: null,
    role: "system",
    content: formatSystemProposition(proposition.trim(), config.prompts),
    time: new Date().toISOString(),
  },
];

const agents = createAgentsFromRoster({
  roster: roster.agents,
  prompts: config.prompts,
  initialContext: messages,
});

console.log(
  `Provider: ${provider.name} (${provider.key}) | Model: ${model} | temp=${temperature} | maxAgents=${maxAgents}`,
);
console.log(`Roster: ${roster.name} (${roster.key}) | agents=${agents.length}`);
console.log(messages[0].content);
console.log("");

for (let i = 0; i < rounds; i += 1) {
  const requester = createOpenAICompatibleRequester({
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    fetchFn: fetch,
  });
  let spokeThisRound = 0;
  const result = await runArenaRound(
    {
      model,
      temperature,
      maxAgents,
      streaming,
      agents,
      messages,
      requestChatCompletion: requester,
    },
    {
      onAgentSpoke: (message) => {
        spokeThisRound += 1;
        const agent =
          agents.find((item) => item.id === message.agentId)?.name ?? "Agent";
        console.log(`${agent}: ${message.content}`);
        console.log("");
      },
    },
  );

  messages = result.messages;

  if (result.error) {
    console.error(`Error: ${result.error}`);
    process.exitCode = 1;
    break;
  }

  if (spokeThisRound === 0) {
    console.log("No agents responded.");
    console.log("");
  }

  console.log(`\n--- Round ${i + 1} complete ---\n`);
}
