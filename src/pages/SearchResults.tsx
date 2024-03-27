import { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import { useSearchParams } from "react-router-dom";
import CardGrid from "../components/Cards/CardGrid";
import { StyledCardGrid } from "../components/Cards/CardGrid";
import { fetchAdvancedSearch } from "../hooks/useApi";
import CardSkeleton from "../components/Skeletons/CardSkeleton";

const Container = styled.div`
  min-height: 85vh;
  // margin-left: 5rem;
  // margin-right: 5rem;
  @media (max-width: 1500px) {
    margin-left: 0rem;
    margin-right: 0rem;
  }
`;

const SearchTitle = styled.h2`
  text-align: left;
  margin-bottom: 2rem;
  font-weight: 400;
`;

const SearchResults = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("query") || "";
  const [animeData, setAnimeData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [page, setPage] = useState(1);
  const delayTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastCachedPage = useRef(0);
  const [, /* loadingStates */ setLoadingStates] = useState<boolean[]>([]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = query ? `${query} - Miruro` : "Miruro";
    return () => {
      // Reset the title to the previous one when the component unmounts
      document.title = previousTitle;
    };
  }, [animeData.length, query]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setPage(1);
    lastCachedPage.current = 0;
  }, [query]);

  const initiatefetchAdvancedSearch = async () => {
    setIsLoading(true);

    if (page > 1) {
      setLoadingStates((prev) => [
        ...prev,
        ...Array.from({ length: 20 }, () => true),
      ]);
    }

    try {
      const fetchedData = await fetchAdvancedSearch(
        query,
        page,
        20,
        (isCached: boolean) => {
          if (!isCached) {
            preloadNextPage(page + 1);
          }
        }
      );

      if (page === 1) {
        setAnimeData(fetchedData.results);
        setLoadingStates(
          Array.from({ length: fetchedData.results.length }, () => false)
        );
        preloadNextPage(page + 1);
      } else {
        setAnimeData((prevData) => [...prevData, ...fetchedData.results]);
        setLoadingStates((prev) =>
          prev.map((state, index) => (index >= (page - 1) * 20 ? false : state))
        );
      }

      setTotalPages(fetchedData.totalPages);
      setHasNextPage(fetchedData.hasNextPage);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadMore = () => {
    setPage((prevPage) => prevPage + 1);
  };

  const preloadNextPage = (nextPage: number) => {
    if (
      nextPage <= totalPages &&
      nextPage > lastCachedPage.current &&
      hasNextPage
    ) {
      fetchAdvancedSearch(query, nextPage, 25, (isCached: boolean) => {
        if (!isCached) {
          lastCachedPage.current = nextPage;
          preloadNextPage(nextPage + 1);
        }
      });
    }
  };

  useEffect(() => {
    if (delayTimeout.current) clearTimeout(delayTimeout.current);
    delayTimeout.current = setTimeout(() => {
      initiatefetchAdvancedSearch();
    }, 0);

    return () => {
      if (delayTimeout.current) clearTimeout(delayTimeout.current);
    };
  }, [query, page]);

  return (
    <Container>
      <SearchTitle>
        {animeData.length} Search Results: <strong>{query}</strong>
      </SearchTitle>
      {isLoading && page === 1 ? (
        <StyledCardGrid>
          {Array.from({ length: 20 }).map((_, index) => (
            <CardSkeleton key={index} {...{ isLoading: true }} />
          ))}
        </StyledCardGrid>
      ) : (
        <CardGrid
          animeData={animeData}
          totalPages={totalPages}
          hasNextPage={hasNextPage}
          onLoadMore={handleLoadMore}
        />
      )}
    </Container>
  );
};

export default SearchResults;
