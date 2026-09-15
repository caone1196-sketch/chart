#include <stdio.h>
#include "swephexp.h"

int main(void) {
  const int systems[13] = {'A','D','B','C','K','M','N','O','P','R','S','T','W'};
  double lats[7] = {-66, -45, -23, 0, 21, 45, 66};
  double eps = 23.4393;
  int first = 1;
  printf("[");
  for (int a = 0; a < 360; a += 45) {
    for (int j = 0; j < 7; j++) {
      for (int i = 0; i < 13; i++) {
        double cusps[37], ascmc[10];
        int r = swe_houses_armc((double)a, lats[j], eps, systems[i], cusps, ascmc);
        printf("%s{\"armc\":%d,\"lat\":%.1f,\"sys\":\"%c\",\"ok\":%d,\"asc\":%.4f,\"mc\":%.4f,\"vertex\":%.4f,\"equasc\":%.4f,\"cusps\":[",
               first ? "" : ",", a, lats[j], systems[i], r, ascmc[0], ascmc[1], ascmc[3], ascmc[4]);
        first = 0;
        for (int k = 1; k <= 12; k++) printf("%s%.4f", k == 1 ? "" : ",", cusps[k]);
        printf("]}");
      }
    }
  }
  printf("]\n");
  return 0;
}
