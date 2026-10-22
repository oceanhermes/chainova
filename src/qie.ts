import { createPublicClient, http, defineChain } from 'viem';

// QIE Mainnet — official network parameters (docs.qie.digital)
export const qie = defineChain({
  id: 1990,
  name: 'QIE Blockchain Mainnet',
  nativeCurrency: { name: 'QIE', symbol: 'QIE', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://rpc1mainnet.qie.digital/'],
    },
  },
  blockExplorers: {
    default: {
      name: 'QIE Explorer',
      url: 'https://mainnet.qie.digital',
    },
  },
});

export const qieClient = createPublicClient({
  chain: qie,
  transport: http('https://rpc1mainnet.qie.digital/', {
    fallback: {
      // rpc2 as automatic fallback on RPC failure
      source: http('https://rpc2mainnet.qie.digital/'),
    },
  }),
});
