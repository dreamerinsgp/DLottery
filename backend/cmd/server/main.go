package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"dlottery/backend/internal/indexer"
	"dlottery/backend/internal/lottery"
	"dlottery/backend/internal/service"
	"dlottery/backend/internal/store"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	var cfg service.Config
	manifest := env("DEPLOYMENT_FILE", "../shared/deployment.json")
	if body, err := os.ReadFile(manifest); err == nil {
		if err = json.Unmarshal(body, &cfg); err != nil {
			return fmt.Errorf("invalid deployment manifest")
		}
	}
	cfg.ChainID = env("CHAIN_ID", cfg.ChainID)
	cfg.LotteryAddress = env("LOTTERY_ADDRESS", cfg.LotteryAddress)
	if !common.IsHexAddress(cfg.LotteryAddress) || common.HexToAddress(cfg.LotteryAddress) == (common.Address{}) {
		return fmt.Errorf("set LOTTERY_ADDRESS or supply a deployment manifest")
	}
	if cfg.ChainID == "" {
		return fmt.Errorf("CHAIN_ID is required")
	}
	cfg.RPCURL = env("RPC_HTTP_URL", "http://127.0.0.1:8545")
	var err error
	cfg.DeploymentBlock, err = strconv.ParseInt(env("DEPLOYMENT_BLOCK", fmt.Sprint(cfg.DeploymentBlock)), 10, 64)
	if err != nil || cfg.DeploymentBlock < 0 {
		return fmt.Errorf("invalid DEPLOYMENT_BLOCK")
	}
	cfg.Confirmations, err = strconv.ParseUint(env("CONFIRMATIONS", "2"), 10, 16)
	if err != nil {
		return fmt.Errorf("invalid CONFIRMATIONS")
	}
	pollMS, err := strconv.Atoi(env("POLL_INTERVAL_MS", "2000"))
	if err != nil || pollMS < 50 || pollMS > 30000 {
		return fmt.Errorf("invalid POLL_INTERVAL_MS")
	}
	connect, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	client, err := ethclient.DialContext(connect, cfg.RPCURL)
	if err != nil {
		return fmt.Errorf("RPC connection failed")
	}
	defer client.Close()
	chainID, err := client.ChainID(connect)
	if err != nil {
		return fmt.Errorf("cannot query chain ID")
	}
	if chainID.String() != cfg.ChainID {
		return fmt.Errorf("configured chain ID differs from RPC")
	}
	address := common.HexToAddress(cfg.LotteryAddress)
	cfg.LotteryAddress = strings.ToLower(address.Hex())
	code, err := client.CodeAt(connect, address, nil)
	if err != nil || len(code) == 0 {
		return fmt.Errorf("lottery has no contract code on configured chain")
	}
	read := func(name string) (any, error) {
		data, e := lottery.ABI.Pack(name)
		if e != nil {
			return nil, e
		}
		result, e := client.CallContract(connect, ethereum.CallMsg{To: &address, Data: data}, nil)
		if e != nil {
			return nil, e
		}
		values, e := lottery.ABI.Unpack(name, result)
		if e != nil || len(values) != 1 {
			return nil, fmt.Errorf("invalid contract result for %s", name)
		}
		return values[0], nil
	}
	for _, field := range []struct {
		name   string
		target *string
	}{{"token", &cfg.TokenAddress}, {"dao", &cfg.DAOAddress}, {"randomnessProvider", &cfg.RandomnessProvider}} {
		v, e := read(field.name)
		if e != nil {
			return fmt.Errorf("cannot read contract configuration: %s", field.name)
		}
		*field.target = strings.ToLower(v.(common.Address).Hex())
	}
	decimals, e := read("tokenDecimals")
	if e != nil {
		return fmt.Errorf("cannot read token decimals")
	}
	cfg.TokenDecimals = decimals.(uint8)
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	db, err := store.Open(ctx, databaseURL, cfg.ChainID+":"+cfg.LotteryAddress, cfg.DeploymentBlock)
	if err != nil {
		return fmt.Errorf("database setup failed")
	}
	defer db.Close()
	if err = db.Lock(ctx); err != nil {
		return err
	}
	idx := &indexer.Indexer{Store: db, Chain: client, Address: address, Confirmations: cfg.Confirmations, Poll: time.Duration(pollMS) * time.Millisecond}
	workerDone := make(chan struct{})
	go func() { defer close(workerDone); idx.Run(ctx) }()
	api := &service.Server{Store: db, Indexer: idx, Config: cfg, Origins: strings.Split(env("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080"), ",")}
	srv := &http.Server{Addr: ":" + env("PORT", "8081"), Handler: api.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second}
	failed := make(chan error, 1)
	go func() { failed <- srv.ListenAndServe() }()
	slog.Info("DLottery service started", "address", srv.Addr, "chainId", cfg.ChainID, "lottery", cfg.LotteryAddress)
	select {
	case <-ctx.Done():
	case err = <-failed:
		stop()
	}
	shutdown, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	_ = srv.Shutdown(shutdown)
	stop()
	<-workerDone
	if err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}
func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		client := &http.Client{Timeout: 2 * time.Second}
		response, err := client.Get("http://127.0.0.1:" + env("PORT", "8081") + "/readyz")
		if err != nil {
			os.Exit(1)
		}
		response.Body.Close()
		if response.StatusCode != 200 {
			os.Exit(1)
		}
		return
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(); err != nil {
		slog.Error("service stopped", "error", err)
		os.Exit(1)
	}
}
