"""Small transformer classifier over a cluster's per-point thermal history,
plus static aggregate features. Deliberately tiny (2 layers, short
sequences) - this is not a language model, just a sequence encoder for
~16 timesteps of FRP/temperature/distance readings.

No per-location ID embedding anywhere - the model sees only content
features (readings + static aggregates), so it can classify a location
it has never seen during training.
"""

import torch
import torch.nn as nn

from schema import LABELS, MAX_SEQ_LEN, SEQ_FEATURE_DIM, STATIC_FEATURE_DIM


class FirmsClassifier(nn.Module):
    def __init__(self, d_model: int = 32, nhead: int = 4, num_layers: int = 2):
        super().__init__()
        self.input_proj = nn.Linear(SEQ_FEATURE_DIM, d_model)
        self.pos_embedding = nn.Parameter(torch.zeros(1, MAX_SEQ_LEN, d_model))
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=nhead, dim_feedforward=d_model * 2,
            batch_first=True, dropout=0.1,
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.static_proj = nn.Linear(STATIC_FEATURE_DIM, d_model)
        self.head = nn.Sequential(
            nn.Linear(d_model * 2, d_model), nn.ReLU(), nn.Linear(d_model, len(LABELS)),
        )

    def forward(self, seq: torch.Tensor, seq_mask: torch.Tensor, static: torch.Tensor) -> torch.Tensor:
        """seq: (B, MAX_SEQ_LEN, SEQ_FEATURE_DIM), seq_mask: (B, MAX_SEQ_LEN) True=padding,
        static: (B, STATIC_FEATURE_DIM). Returns logits (B, len(LABELS))."""
        x = self.input_proj(seq) + self.pos_embedding
        x = self.encoder(x, src_key_padding_mask=seq_mask)
        # mean-pool over non-padding timesteps
        valid = (~seq_mask).unsqueeze(-1).float()
        pooled = (x * valid).sum(dim=1) / valid.sum(dim=1).clamp(min=1.0)
        s = self.static_proj(static)
        return self.head(torch.cat([pooled, s], dim=-1))
