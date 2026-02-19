import React from 'react';

export default function RoutinesTabContainer(props) {
  const { RoutinesTabComponent, ...rest } = props;
  return <RoutinesTabComponent {...rest} />;
}
