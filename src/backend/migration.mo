module {
  type Actor = { appVersion : Text };

  public func run(old : Actor) : Actor {
    { old with appVersion = "0.3.88" };
  };
};
