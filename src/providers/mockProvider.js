export default class MockProvider {
  constructor() {
    this.name = "mock_provider";
  }

  async charge(transaction) {
    // Simulate network delay
    await new Promise(r => setTimeout(r, 200 + Math.random() * 300));

    const success = Math.random() < 0.7; // 70% success rate

    if (success) {
      return {
        success: true,
        providerRef: `MOCK-${Math.floor(Math.random() * 100000)}`
      };
    }

    return {
      success: false,
      error: "mock-provider-failure"
    };
  }
}
